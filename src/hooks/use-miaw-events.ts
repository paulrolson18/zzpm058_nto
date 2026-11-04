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

interface UseMiawEventsOptions {
    /** URL of the BFF SSE proxy route, e.g. `/en-US/RefArch/api/miaw-events` */
    eventsUrl: string;
    /** Called for each agent text message. `messageId` is used by the caller to deduplicate. */
    onAgentMessage: (text: string, messageId: string) => void;
    /** Called when the agent starts or stops typing. */
    onTyping: (isTyping: boolean) => void;
    /** Open the SSE connection only when true; close and discard it when false. */
    enabled: boolean;
}

/** Parsed shape of a MIAW CONVERSATION_MESSAGE event payload. */
interface MiawMessagePayload {
    conversationEntry?: {
        entryType?: string;
        identifier?: string;
        sender?: { role?: string };
        entryPayload?: string;
    };
}

interface MiawMessageContent {
    abstractMessage?: {
        staticContent?: { text?: string };
    };
}

/**
 * Opens an EventSource to the MIAW SSE proxy and fires callbacks for agent messages
 * and typing indicators. Automatically closes the connection when `enabled` turns false.
 *
 * Returns a `close()` function for callers that need to tear down the SSE synchronously
 * (e.g. before issuing a session DELETE) rather than waiting for the next React paint.
 *
 * The native EventSource reconnects on its own; Last-Event-ID is forwarded automatically
 * via the browser's built-in reconnect mechanism.
 */
export function useMiawEvents({ eventsUrl, onAgentMessage, onTyping, enabled }: UseMiawEventsOptions): {
    close: () => void;
} {
    const onAgentMessageRef = useRef(onAgentMessage);
    const onTypingRef = useRef(onTyping);
    onAgentMessageRef.current = onAgentMessage;
    onTypingRef.current = onTyping;

    // Holds the live EventSource so callers can close it synchronously without waiting for
    // the useEffect cleanup (which runs after paint and would allow a reconnect 401 cycle).
    const esRef = useRef<EventSource | null>(null);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        const es = new EventSource(eventsUrl);
        esRef.current = es;

        es.addEventListener('CONVERSATION_MESSAGE', (event) => {
            try {
                const outer = JSON.parse(event.data as string) as MiawMessagePayload;
                const entry = outer.conversationEntry;
                if (!entry) return;
                if (entry.sender?.role === 'EndUser' || entry.sender?.role === 'System') return;

                const messageId = entry.identifier ?? event.lastEventId ?? '';
                let text = '';
                try {
                    const payload = JSON.parse(entry.entryPayload ?? '{}') as MiawMessageContent;
                    text = payload.abstractMessage?.staticContent?.text ?? '';
                } catch {
                    // malformed payload — skip
                }
                if (text) {
                    onAgentMessageRef.current(text, messageId);
                }
            } catch {
                // non-JSON — ignore
            }
        });

        es.addEventListener('CONVERSATION_TYPING_STARTED_INDICATOR', () => {
            onTypingRef.current(true);
        });

        es.addEventListener('CONVERSATION_TYPING_STOPPED_INDICATOR', () => {
            onTypingRef.current(false);
        });

        return () => {
            es.close();
            esRef.current = null;
        };
    }, [enabled, eventsUrl]);

    return {
        close: () => {
            esRef.current?.close();
            esRef.current = null;
        },
    };
}
