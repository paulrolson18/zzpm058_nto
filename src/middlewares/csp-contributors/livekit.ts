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

import type { CspContributor, CspContribution } from '@salesforce/storefront-next-runtime/security';
import { isRunwayEnabled, type RunwayConfig } from '@/utils/runway.utils.js';
import { toCspOrigin } from './to-csp-origin.js';

/**
 * CSP contributor for the LiveKit WebSocket connection used by the Runway LiveAvatar.
 * Adds `connect-src wss://{livekitHost}` when the Runway agent is enabled.
 * Reads the URL from LIVEKIT_URL env var (server-side only) — not from the browser config.
 */
export function createLivekitCspContributor(config: RunwayConfig | undefined): CspContributor {
    return {
        id: 'livekit',
        isActive: () => isRunwayEnabled(config?.enabled),
        contribute: (): CspContribution => {
            if (!isRunwayEnabled(config?.enabled)) return {};

            const livekitUrl = process.env.LIVEKIT_URL;
            if (!livekitUrl) return {};

            const httpsOrigin = toCspOrigin(livekitUrl.replace(/^wss?:\/\//, 'https://'));
            if (!httpsOrigin) return {};

            return { 'connect-src': [httpsOrigin] };
        },
    };
}
