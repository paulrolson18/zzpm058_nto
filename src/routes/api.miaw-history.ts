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
import type { Route } from './+types/api.miaw-history';
import { getConfig } from '@salesforce/storefront-next-runtime/config';
import { resolveShopperAgentConfig } from '@/components/cimulate/cimulate.utils';
import { listConversationEntries } from '@/lib/miaw/miaw.server';
import { getMiawSession, isMiawSessionValid } from '@/lib/miaw/miaw-cookie.server';
import type { ChatMessage } from '@/components/runway-chat/use-runway-chat';
import { createLogger } from '@/lib/logger';

const logger = createLogger({ component: 'miaw-history' });

interface EntryPayload {
    abstractMessage?: { staticContent?: { text?: string } };
}

/** Extract the message text from a SCRT2 entryPayload.
 * The API returns the payload as a nested object (not a stringified JSON string). */
function extractMessageText(entryPayload: unknown): string | null {
    try {
        const payload: EntryPayload =
            typeof entryPayload === 'string'
                ? (JSON.parse(entryPayload) as EntryPayload)
                : (entryPayload as EntryPayload);
        return payload.abstractMessage?.staticContent?.text ?? null;
    } catch {
        return null;
    }
}

/**
 * Resource route: returns conversation history for the active MIAW session.
 *
 * GET — fetch up to 50 Message entries oldest-first from SCRT2 and map them
 *       to ChatMessage[]. Returns an empty array when there is no session,
 *       the session has no sent messages yet, or SCRT2 returns an error (fail-open).
 */

export const shouldRevalidate = () => false;

export async function loader({ request, context }: Route.LoaderArgs) {
    const session = await getMiawSession(request, context);

    // No active session, expired token, or no messages sent yet — nothing to load
    if (!session || !isMiawSessionValid(session) || !session.messageSent) {
        return data({ messages: [] as ChatMessage[] });
    }

    const appConfig = getConfig(context);
    const shopperAgent = resolveShopperAgentConfig(appConfig);
    if (!shopperAgent?.scrt2Url) {
        return data({ messages: [] as ChatMessage[] });
    }

    try {
        // SCRT2 returns newest-first by default; reverse for chronological display order
        const entries = (
            await listConversationEntries(shopperAgent.scrt2Url, session.accessToken, session.conversationId)
        ).reverse();

        logger.info('[miaw-history] entries fetched', { count: entries.length });

        const messages: ChatMessage[] = entries
            .map((entry) => {
                const text = extractMessageText(entry.entryPayload);
                if (!text) return null;
                // SCRT2 uses 'EndUser' (PascalCase) for the sender role
                const role = entry.sender.role === 'EndUser' || entry.sender.role === 'endUser' ? 'user' : 'agent';
                return {
                    id: entry.identifier,
                    role: role as 'user' | 'agent',
                    text,
                    timestamp: new Date(entry.transcribedTimestamp),
                };
            })
            .filter((m): m is ChatMessage => m !== null);

        return data({ messages });
    } catch (err) {
        // Fail-open: history fetch errors don't block the chat
        logger.warn('[miaw-history] failed to fetch entries', { error: String(err) });
        return data({ messages: [] as ChatMessage[] });
    }
}
