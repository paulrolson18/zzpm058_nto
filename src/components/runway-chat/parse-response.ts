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

import type { CarouselProduct } from './message-blocks/product-carousel-block';

export interface MarkdownResponseBlock {
    type: 'markdown';
    index: number;
    data: { content: string };
}

export interface SuggestionsResponseBlock {
    type: 'suggestions';
    index: number;
    data: { display_text: string[] };
}

export interface ProductCarouselResponseBlock {
    type: 'product_carousel';
    index: number;
    data: { title: string; products: CarouselProduct[] };
}

export type ResponseBlock = MarkdownResponseBlock | SuggestionsResponseBlock | ProductCarouselResponseBlock;

export interface StructuredResponse {
    response: ResponseBlock[];
}

export function parseStructuredResponse(text: string): StructuredResponse | null {
    try {
        const parsed = JSON.parse(text) as unknown;
        if (
            parsed !== null &&
            typeof parsed === 'object' &&
            'response' in parsed &&
            Array.isArray((parsed as StructuredResponse).response)
        ) {
            return parsed as StructuredResponse;
        }
    } catch {
        // not JSON — fall through to plain text
    }
    return null;
}
