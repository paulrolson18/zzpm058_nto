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

import { MarkdownBlock } from './message-blocks/markdown-block';
import { SuggestionsBlock } from './message-blocks/suggestions-block';
import { ProductCarouselBlock } from './message-blocks/product-carousel-block';
import { parseStructuredResponse } from './parse-response';

// ── Component ──────────────────────────────────────────────────────────────────

interface MessageContentProps {
    text: string;
    onSuggestionClick?: (text: string) => void;
}

export function MessageContent({ text, onSuggestionClick }: MessageContentProps) {
    const structured = parseStructuredResponse(text);

    // Plain text — render inside a standard bubble
    if (!structured) {
        return (
            <div className="mr-auto max-w-[80%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground [&_p:last-child]:mb-0 [&_p]:mb-1">
                <MarkdownBlock content={text} />
            </div>
        );
    }

    // Structured response — render each block in index order
    const blocks = [...structured.response].sort((a, b) => a.index - b.index);

    return (
        <div className="flex w-full flex-col gap-2">
            {blocks.map((block) => {
                if (block.type === 'markdown') {
                    return (
                        <div
                            key={block.index}
                            className="mr-auto max-w-[80%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground [&_p:last-child]:mb-0 [&_p]:mb-1">
                            <MarkdownBlock content={block.data.content} />
                        </div>
                    );
                }

                if (block.type === 'suggestions') {
                    return (
                        <SuggestionsBlock
                            key={block.index}
                            items={block.data.display_text}
                            onSelect={onSuggestionClick}
                        />
                    );
                }

                if (block.type === 'product_carousel') {
                    return (
                        <ProductCarouselBlock
                            key={block.index}
                            title={block.data.title}
                            products={block.data.products}
                        />
                    );
                }

                return null;
            })}
        </div>
    );
}
