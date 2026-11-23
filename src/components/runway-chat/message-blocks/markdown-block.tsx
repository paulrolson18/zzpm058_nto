/**
 * Copyright 2026 Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

interface MarkdownBlockProps {
    content: string;
    className?: string;
}

// ── Patterns ──────────────────────────────────────────────────────────────────

const HEADING_RE    = /^(#{1,6})\s+(.+)$/;
const HR_RE         = /^(-{3,}|\*{3,}|_{3,})$/;
const BLOCKQUOTE_RE = /^&gt;\s?(.*)$/; // > is HTML-escaped to &gt; before matching
const OL_RE         = /^\d+\.\s+(.+)$/;
const UL_RE         = /^[-*+]\s+(.+)$/;

const HEADING_CLASSES = [
    'text-base font-bold mt-3 mb-1',
    'text-sm font-bold mt-2 mb-1',
    'text-sm font-semibold mt-2 mb-0.5',
    'text-xs font-semibold mt-1',
    'text-xs font-medium',
    'text-xs',
] as const;

// ── Primitives ─────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Applies all inline formatting to an already HTML-escaped string. */
function applyInline(s: string): string {
    return s
        .replace(/\*\*\*(.+?)\*\*\*/gs, '<strong><em>$1</em></strong>')
        .replace(/___(.+?)___/gs, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
        .replace(/__(.+?)__/gs, '<strong>$1</strong>')
        .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
        .replace(/_([^_\n]+?)_/g, '<em>$1</em>')
        .replace(/~~(.+?)~~/gs, '<del>$1</del>')
        .replace(/`([^`\n]+?)`/g, '<code class="rounded bg-muted px-1 font-mono text-xs">$1</code>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url: string) => {
            // Only allow safe hrefs to prevent javascript: injection
            const href = /^https?:\/\/|^\//.test(url.trim()) ? url.trim() : '#';
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="underline">${text}</a>`;
        });
}

// ── Single-line block renderers ────────────────────────────────────────────────

function renderHeading(line: string): string | null {
    const m = HEADING_RE.exec(line);
    if (!m) return null;
    const level = m[1].length;
    return `<h${level} class="${HEADING_CLASSES[level - 1]}">${applyInline(m[2])}</h${level}>`;
}

function renderHorizontalRule(line: string): string | null {
    return HR_RE.test(line.trim()) ? '<hr class="my-2 border-border">' : null;
}

function renderBlockquote(line: string): string | null {
    const m = BLOCKQUOTE_RE.exec(line);
    return m
        ? `<blockquote class="border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground">${applyInline(m[1])}</blockquote>`
        : null;
}

// ── Multi-line block renderers ─────────────────────────────────────────────────

interface Block { html: string; end: number }

function isBlockBoundary(line: string): boolean {
    return !line.trim()
        || HEADING_RE.test(line)
        || HR_RE.test(line.trim())
        || BLOCKQUOTE_RE.test(line)
        || OL_RE.test(line)
        || UL_RE.test(line);
}

function renderList(lines: string[], start: number): Block | null {
    const isOL = OL_RE.test(lines[start]);
    const isUL = UL_RE.test(lines[start]);
    if (!isOL && !isUL) return null;

    const pattern  = isOL ? OL_RE : UL_RE;
    const tag      = isOL ? 'ol' : 'ul';
    const cssClass = isOL ? 'list-decimal pl-4 my-1' : 'list-disc pl-4 my-1';

    const items: string[] = [];
    let i = start;
    while (i < lines.length && pattern.test(lines[i])) {
        // biome-ignore lint/style/noNonNullAssertion: pattern was just tested above
        items.push(`<li>${applyInline(pattern.exec(lines[i])![1])}</li>`);
        i++;
    }
    return { html: `<${tag} class="${cssClass}">${items.join('')}</${tag}>`, end: i };
}

function renderParagraph(lines: string[], start: number): Block {
    const pLines: string[] = [];
    let i = start;
    while (i < lines.length && !isBlockBoundary(lines[i])) {
        pLines.push(applyInline(lines[i]));
        i++;
    }
    return { html: `<p>${pLines.join('<br>')}</p>`, end: i };
}

// ── Orchestrator ───────────────────────────────────────────────────────────────

/** Converts markdown to safe HTML per https://www.markdownguide.org/basic-syntax/ */
function renderMarkdown(content: string): string {
    const lines = escapeHtml(content).split('\n');
    const output: string[] = [];
    let i = 0;

    while (i < lines.length) {
        if (!lines[i].trim()) { i++; continue; }

        const heading = renderHeading(lines[i]);
        if (heading) { output.push(heading); i++; continue; }

        const hr = renderHorizontalRule(lines[i]);
        if (hr) { output.push(hr); i++; continue; }

        const blockquote = renderBlockquote(lines[i]);
        if (blockquote) { output.push(blockquote); i++; continue; }

        const list = renderList(lines, i);
        if (list) { output.push(list.html); i = list.end; continue; }

        const para = renderParagraph(lines, i);
        output.push(para.html);
        i = para.end;
    }

    return output.join('');
}

export function MarkdownBlock({ content, className }: MarkdownBlockProps) {
    return (
        <div
            className={className}
            // Content is escaped above — only our known tags (<strong>, <em>, <br>, <p>) are injected
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
        />
    );
}
