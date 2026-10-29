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

import { createLogger } from '@/lib/logger';

const logger = createLogger();

export interface RunwayConfig {
    enabled: string | boolean;
    tokenEndpoint?: string;
}

export function isRunwayEnabled(enabled: string | boolean | undefined): boolean {
    return enabled === 'true' || enabled === true;
}

export function validateRunwayConfig(config: unknown): config is RunwayConfig {
    if (!config || typeof config !== 'object') {
        logger.error('Runway configuration must be an object.');
        return false;
    }
    return true;
}

/**
 * Extracts the plain speak text from a SCRT2 SSE response JSON object.
 * Returns the first non-empty text string found in the response body.
 */
export function extractSpeakText(json: unknown): string | null {
    if (!json || typeof json !== 'object') return null;

    const obj = json as Record<string, unknown>;

    // SCRT2 TextChunk events arrive as { message: { type: "TextChunk", message: "..." } }
    const msg = obj.message;
    if (msg && typeof msg === 'object') {
        const inner = msg as Record<string, unknown>;
        if (inner.type === 'TextChunk' && typeof inner.message === 'string' && inner.message.trim()) {
            return inner.message.trim();
        }
    }

    // Fallback: look for a top-level "text" field
    if (typeof obj.text === 'string' && obj.text.trim()) {
        return obj.text.trim();
    }

    return null;
}
