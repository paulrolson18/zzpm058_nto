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

import { useState, useEffect } from 'react';
import { createLogger } from '@/lib/logger';

const logger = createLogger({ component: 'runway' });

export interface LivekitTokenState {
    token: string | null;
    livekitUrl: string | null;
    isError: boolean;
}

/**
 * Fetches a LiveKit room token from the server.
 * Room lifecycle is managed by <LiveKitRoom> from @livekit/components-react.
 */
export function useLivekitToken(tokenEndpoint: string, enabled: boolean): LivekitTokenState {
    const [token, setToken] = useState<string | null>(null);
    const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
    const [isError, setIsError] = useState(false);

    useEffect(() => {
        if (!enabled) {
            setToken(null);
            setLivekitUrl(null);
            setIsError(false);
            return;
        }

        let cancelled = false;
        setToken(null);
        setLivekitUrl(null);
        setIsError(false);

        logger.info('[runway] fetching token', { tokenEndpoint });

        const fetchToken = async () => {
            try {
                const resp = await fetch(tokenEndpoint);
                if (!resp.ok) throw new Error(`Token fetch failed: ${resp.status} ${resp.url}`);
                const { token: t, livekitUrl: url } = JSON.parse(await resp.text()) as {
                    token: string;
                    livekitUrl: string;
                };
                if (!cancelled) {
                    logger.info('[runway] token received', { livekitUrl: url });
                    setToken(t);
                    setLivekitUrl(url);
                }
            } catch (error) {
                if (!cancelled) {
                    logger.error('[runway] token fetch failed', { error: String(error) });
                    setIsError(true);
                }
            }
        };

        void fetchToken();
        return () => {
            cancelled = true;
        };
    }, [enabled, tokenEndpoint]);

    return { token, livekitUrl, isError };
}
