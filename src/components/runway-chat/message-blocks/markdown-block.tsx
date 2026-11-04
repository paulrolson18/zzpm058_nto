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

/** Converts a subset of markdown (bold, italic, line breaks) to safe HTML. */
function renderMarkdown(content: string): string {
    // Escape HTML entities first to prevent XSS before we inject our own tags
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Bold (**text**) before italic to avoid single-asterisk ambiguity
    const withBold = escaped.replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>');
    const withItalic = withBold.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');

    // Split on blank lines for paragraphs; newlines within a paragraph become <br>
    return withItalic
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
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
