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

import { data } from 'react-router';
import type { Route } from './+types/api.miaw-events';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { resolveShopperAgentConfig } from '@/components/cimulate/cimulate.utils';
import { getMiawSession } from '@/lib/miaw/miaw-cookie.server';

/**
 * Resource route: proxies the SCRT2 SSE event stream to the browser.
 *
 * The browser opens an EventSource to this URL; this loader opens its own
 * persistent connection to SCRT2's eventrouter and pipes the body straight
 * through. No buffering — events arrive in real time.
 *
 * Reconnection: the browser's native EventSource sends `Last-Event-ID` on
 * reconnect; we forward it to SCRT2 so the stream resumes from where it left off.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
    const session = await getMiawSession(request, context);
    if (!session) {
        return data({ error: 'No active MIAW session' }, { status: 401 });
    }

    const appConfig = getConfig(context);
    const shopperAgent = resolveShopperAgentConfig(appConfig);
    if (!shopperAgent?.scrt2Url || !shopperAgent.salesforceOrgId) {
        return data({ error: 'Shopper agent not configured' }, { status: 503 });
    }

    const { scrt2Url, salesforceOrgId } = shopperAgent;
    const lastEventId = request.headers.get('Last-Event-ID');

    const scrtRes = await fetch(`${scrt2Url}/eventrouter/v1/sse`, {
        headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'X-Org-Id': salesforceOrgId,
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
            ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
        },
    });

    if (!scrtRes.ok || !scrtRes.body) {
        return data({ error: `SCRT2 SSE connection failed: ${scrtRes.status}` }, { status: 502 });
    }

    return new Response(scrtRes.body, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
