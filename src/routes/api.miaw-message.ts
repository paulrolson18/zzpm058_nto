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
import type { Route } from './+types/api.miaw-message';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { siteContext } from '@salesforce/storefront-next-runtime/site-context';
import { resolveShopperAgentConfig } from '@/components/cimulate/cimulate.utils';
import { sendMiawMessage } from '@/lib/miaw/miaw.server';
import { getMiawSession, serializeMiawSession } from '@/lib/miaw/miaw-cookie.server';
import { getNavigationCategories } from '@/lib/navigation-category-cache.server';
import { detectNavigationIntent } from '@/lib/detect-navigation-intent.server';
import type { SeoUrlContext } from '@/route-paths';

/**
 * Resource route: sends a text message to the active MIAW conversation.
 * The `isNewMessagingSession` flag is determined server-side from the cookie
 * so the client never needs to track whether this is the first message.
 */
export async function action({ request, context }: Route.ActionArgs) {
    const session = await getMiawSession(request, context);
    if (!session) {
        return data({ error: 'No active MIAW session' }, { status: 401 });
    }

    const appConfig = getConfig(context);
    const shopperAgent = resolveShopperAgentConfig(appConfig);
    if (!shopperAgent?.scrt2Url || !shopperAgent.esDeveloperName) {
        return data({ error: 'Shopper agent not configured' }, { status: 503 });
    }

    const body = (await request.json()) as { id?: string; text?: string };
    if (!body.id || !body.text?.trim()) {
        return data({ error: 'Missing id or text' }, { status: 400 });
    }

    const siteCtx = context.get(siteContext);
    const seoUrlContext: SeoUrlContext = {
        siteId: siteCtx?.site?.id ?? '',
        urlPrefix: appConfig.url?.prefix,
        seoRoutes: appConfig.url?.seoRoutes,
    };

    // allSettled: a MIAW failure never discards a detected navigation intent.
    const [miawResult, intentResult] = await Promise.allSettled([
        sendMiawMessage(
            shopperAgent.scrt2Url,
            session.accessToken,
            session.conversationId,
            shopperAgent.esDeveloperName,
            {
                id: body.id,
                text: body.text.trim(),
                isNewMessagingSession: !session.messageSent,
                ...(shopperAgent.routingAttributes ? { routingAttributes: shopperAgent.routingAttributes } : {}),
            }
        ),
        getNavigationCategories(context, 'miaw-message')
            .then((cats) => detectNavigationIntent(body.text!.trim(), cats, seoUrlContext))
            .catch(() => null),
    ]);

    if (miawResult.status === 'rejected') {
        // Return as 200 so messageFetcher.data is set and the client can show the error UI.
        return data({ error: 'service' as const });
    }

    const navigateTo = intentResult.status === 'fulfilled' ? intentResult.value : null;
    const responsePayload = navigateTo ? { ok: true, navigateTo } : { ok: true };

    // Mark that at least one message has been sent — future messages won't restart routing
    if (!session.messageSent) {
        const updated = { ...session, messageSent: true };
        const setCookie = await serializeMiawSession(updated, context);
        return data(responsePayload, { headers: { 'Set-Cookie': setCookie } });
    }

    return data(responsePayload);
}
