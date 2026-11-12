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

/** Converts a subset of markdown (bold, italic, unordered lists, line breaks) to safe HTML. */
function renderMarkdown(content: string): string {
    // Escape HTML entities first to prevent XSS before we inject our own tags
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const applyInline = (s: string) =>
        // Bold (**text**) before italic to avoid single-asterisk ambiguity
        s.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>').replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');

    return escaped
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((paragraph) => {
            const lines = paragraph.split('\n');
            const isBullet = (l: string) => l.startsWith('- ') || l.startsWith('* ');
            if (!lines.some(isBullet)) {
                return `<p>${lines.map(applyInline).join('<br>')}</p>`;
            }
            // Segment consecutive list vs non-list lines to avoid <ul> inside <p>
            type Seg = { type: 'list' | 'text'; lines: string[] };
            const segments: Seg[] = [];
            for (const line of lines) {
                const type = isBullet(line) ? 'list' : 'text';
                if (!segments.length || segments[segments.length - 1].type !== type) {
                    segments.push({ type, lines: [] });
                }
                segments[segments.length - 1].lines.push(type === 'list' ? line.slice(2) : line);
            }
            return segments
                .map((seg) =>
                    seg.type === 'list'
                        ? `<ul class="list-disc pl-4 my-1">${seg.lines.map((l) => `<li>${applyInline(l)}</li>`).join('')}</ul>`
                        : `<p>${seg.lines.map(applyInline).join('<br>')}</p>`,
                )
                .join('');
        })
        .join('');
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
