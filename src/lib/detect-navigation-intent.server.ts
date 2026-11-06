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

import OpenAI from 'openai';
import type { NavigationCategory } from '@/lib/navigation-category-cache.server';
import { createCategoryUrlFromScapiCategory } from '@/lib/seo/scapi-slugs';
import type { SeoUrlContext } from '@/route-paths';
import { createLogger } from '@/lib/logger';

const TOOL_NAME = 'navigate_to_page';
const logger = createLogger({ component: 'navigation-intent' });

/**
 * Runs in parallel with sendMiawMessage — never throws, always returns null on
 * any failure so it cannot break the message send flow.
 *
 * Requires OPENAI_API_KEY. Model is controlled by OPENAI_NAVIGATION_MODEL
 * (default: gpt-6-luna). Works across languages.
 */
export async function detectNavigationIntent(
    text: string,
    categories: NavigationCategory[],
    seoUrlContext: SeoUrlContext
): Promise<string | null> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey || categories.length === 0) return null;

    const model = process.env.OPENAI_NAVIGATION_MODEL ?? 'gpt-6-luna';

    logger.info('navigation-intent: sending to model', { model, text, categoryCount: categories.length });

    const client = new OpenAI({ apiKey });
    const categoryList = categories.map((c) => `${c.id}: ${c.label}`).join('\n');

    let response;
    try {
        response = await client.chat.completions.create({
            model,
            max_completion_tokens: 50,
            // gpt-6-luna (and other reasoning models) require reasoning_effort: 'none'
            // for function calling via Chat Completions
            reasoning_effort: 'none',
            tool_choice: 'auto',
            tools: [
                {
                    type: 'function',
                    function: {
                        name: TOOL_NAME,
                        description:
                            'Navigate the user to a product category page when they clearly want to browse that category. Do NOT call this tool for general questions, greetings, or when the intent is ambiguous.',
                        parameters: {
                            type: 'object',
                            properties: {
                                categoryId: {
                                    type: 'string',
                                    enum: categories.map((c) => c.id),
                                    description: 'The category ID to navigate to.',
                                },
                            },
                            required: ['categoryId'],
                        },
                    },
                },
            ],
            messages: [
                {
                    role: 'system',
                    content: `You are a navigation assistant for an online store. Given a user message, decide if they want to browse a specific product category. If yes, call the ${TOOL_NAME} tool with the best matching category ID.\n\nRules for picking a category:\n- Always prefer the MOST SPECIFIC (deepest) category that matches the user's intent. Never pick a parent when a child matches better.\n- If the user says "boots", pick a boots subcategory (e.g. shoes-men-boots), not the parent "footwear".\n- If gender or age is unspecified, pick the most common match (prefer adult men's or women's over kids, pick men's when fully ambiguous).\n- Only pick a parent/top-level category if the user is clearly asking for an overview (e.g. "show me all footwear").\n- Do NOT call the tool for general questions, greetings, or ambiguous messages with no clear product intent.\n\nAvailable categories:\n${categoryList}`,
                },
                { role: 'user', content: text },
            ],
        });
    } catch (error) {
        logger.error('navigation-intent: OpenAI API error', { error: String(error), model, text });
        return null;
    }

    const toolCall = response.choices[0]?.message?.tool_calls?.find(
        (tc) => tc.type === 'function' && tc.function.name === TOOL_NAME
    );

    if (!toolCall || toolCall.type !== 'function') {
        logger.info('navigation-intent: no navigation intent detected', {
            text,
            finishReason: response.choices[0]?.finish_reason,
        });
        return null;
    }

    const args = JSON.parse(toolCall.function.arguments) as { categoryId?: string };
    const categoryId = args.categoryId;
    if (!categoryId) return null;

    const url = createCategoryUrlFromScapiCategory({ id: categoryId }, seoUrlContext) ?? null;
    logger.info('navigation-intent: navigating', { text, categoryId, url });
    return url;
}
