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

import { useEffect, useRef } from 'react';
import { createLogger } from '@/lib/logger';

const logger = createLogger();

/**
 * Patches window.fetch to intercept JSON responses from the SCRT2 origin.
 * The original response is returned unmodified so Cimulate continues working.
 * The interceptor is installed once and removed on unmount.
 */
export function useScrt2Intercept(scrt2Url: string, onResponse: (json: unknown) => void): void {
    const onResponseRef = useRef(onResponse);
    onResponseRef.current = onResponse;

    useEffect(() => {
        if (typeof window === 'undefined' || !scrt2Url) return;

        let scrt2Origin: string;
        try {
            scrt2Origin = new URL(scrt2Url).origin;
        } catch {
            logger.error('useScrt2Intercept: invalid scrt2Url', { scrt2Url });
            return;
        }

        const originalFetch = window.fetch;

        window.fetch = async (input, init) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;

            const response = await originalFetch(input, init);

            if (url.startsWith(scrt2Origin)) {
                // Clone so Cimulate can still read the original body
                response
                    .clone()
                    .json()
                    .then((json: unknown) => {
                        onResponseRef.current(json);
                    })
                    .catch(() => {
                        // Non-JSON response (e.g. SSE stream) — ignore
                    });
            }

            return response;
        };

        return () => {
            window.fetch = originalFetch;
        };
    }, [scrt2Url]);
}
