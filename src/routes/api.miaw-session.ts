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

import { randomUUID } from 'node:crypto';
import { data } from 'react-router';
import type { Route } from './+types/api.miaw-session';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { resolveShopperAgentConfig } from '@/components/cimulate/cimulate.utils';
import { getMiawAccessToken, createMiawConversation, closeMiawConversation } from '@/lib/miaw/miaw.server';
import { getMiawSession, serializeMiawSession, isMiawSessionValid } from '@/lib/miaw/miaw-cookie.server';

/**
 * Resource route: manages the MIAW conversation session lifecycle.
 *
 * POST — create or reuse an existing session (called when the chat panel opens).
 * DELETE — close the active conversation and clear the session cookie.
 */
export async function action({ request, context }: Route.ActionArgs) {
    const appConfig = getConfig(context);
    const shopperAgent = resolveShopperAgentConfig(appConfig);

    if (!shopperAgent?.scrt2Url || !shopperAgent.salesforceOrgId || !shopperAgent.esDeveloperName) {
        return data({ error: 'config' as const, message: 'Shopper agent not configured' }, { status: 503 });
    }

    const { scrt2Url, salesforceOrgId: orgId, esDeveloperName } = shopperAgent;

    // ── DELETE: close the active conversation ──────────────────────────────
    if (request.method === 'DELETE') {
        const session = await getMiawSession(request, context);
        if (session) {
            try {
                await closeMiawConversation(scrt2Url, session.accessToken, session.conversationId);
            } catch {
                // Best-effort close — clear the cookie even if the remote call fails
            }
        }
        const clearCookie = await serializeMiawSession(null, context);
        return data({ ok: true }, { headers: { 'Set-Cookie': clearCookie } });
    }

    // ── POST: create or reuse session ──────────────────────────────────────
    const existing = await getMiawSession(request, context);

    // 1. Valid session with a live token — reuse as-is
    if (existing && isMiawSessionValid(existing)) {
        return data({ conversationId: existing.conversationId, hasHistory: existing.messageSent });
    }

    // 2. Token expired or no session — create a fresh conversation
    // (Reusing a stale conversationId risks 503s if Salesforce closed it, so always start fresh)
    const conversationId = randomUUID();
    try {
        const { accessToken, expiresAt } = await getMiawAccessToken(scrt2Url, orgId, esDeveloperName);
        await createMiawConversation(scrt2Url, accessToken, conversationId, esDeveloperName);
        const session = { conversationId, accessToken, expiresAt, messageSent: false };
        const setCookie = await serializeMiawSession(session, context);
        return data({ conversationId, hasHistory: false }, { headers: { 'Set-Cookie': setCookie } });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return data({ error: 'service' as const, message }, { status: 503 });
    }
}
