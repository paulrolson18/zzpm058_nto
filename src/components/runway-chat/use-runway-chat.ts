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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';
import { useMiawEvents } from '@/hooks/use-miaw-events';

export interface ChatMessage {
    id: string;
    role: 'user' | 'agent';
    text: string;
    timestamp: Date;
}

interface UseRunwayChatOptions {
    sessionEndpoint: string;
    messageEndpoint: string;
    eventsEndpoint: string;
}

export function useRunwayChat({ sessionEndpoint, messageEndpoint, eventsEndpoint }: UseRunwayChatOptions) {
    const [isOpen, setIsOpen] = useState(false);
    const [isVoiceMode, setIsVoiceMode] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isAgentTyping, setIsAgentTyping] = useState(false);
    const [isSessionReady, setIsSessionReady] = useState(false);
    const [sessionError, setSessionError] = useState<'config' | 'service' | null>(null);

    const sessionFetcher = useFetcher();
    const messageFetcher = useFetcher();

    // Track IDs of messages we sent ourselves so we can skip their SSE echo
    const sentIdsRef = useRef(new Set<string>());

    // ── Session init ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;
        void sessionFetcher.submit(null, { method: 'POST', action: sessionEndpoint });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open toggle
    }, [isOpen, sessionEndpoint]);

    useEffect(() => {
        if (!sessionFetcher.data) return;
        if ('error' in sessionFetcher.data) {
            const kind = sessionFetcher.data.error === 'config' ? 'config' : 'service';
            setSessionError(kind);
        } else {
            setIsSessionReady(true);
            setSessionError(null);
        }
    }, [sessionFetcher.data]);

    // ── Inbound agent messages via SSE ──────────────────────────────────────
    const { close: closeMiawEvents } = useMiawEvents({
        eventsUrl: eventsEndpoint,
        enabled: isOpen && isSessionReady,
        onAgentMessage: useCallback((text: string, messageId: string) => {
            // Receiving a message always means typing has stopped, regardless of event order
            setIsAgentTyping(false);
            if (sentIdsRef.current.has(messageId)) {
                sentIdsRef.current.delete(messageId);
                return;
            }
            setMessages((prev) => [
                ...prev,
                { id: messageId || `agent-${Date.now()}`, role: 'agent', text, timestamp: new Date() },
            ]);
        }, []),
        onTyping: useCallback((isTyping: boolean) => setIsAgentTyping(isTyping), []),
    });

    // ── Outbound message ────────────────────────────────────────────────────
    const sendMessage = useCallback(
        (text: string) => {
            if (!text.trim() || !isSessionReady) return;
            const id = crypto.randomUUID();
            sentIdsRef.current.add(id);

            // Optimistic bubble — shown immediately
            setMessages((prev) => [...prev, { id, role: 'user', text: text.trim(), timestamp: new Date() }]);

            void messageFetcher.submit(JSON.stringify({ id, text: text.trim() }), {
                method: 'POST',
                action: messageEndpoint,
                encType: 'application/json',
            });
        },
        [isSessionReady, messageEndpoint, messageFetcher]
    );

    // ── Session retry ───────────────────────────────────────────────────────
    const retrySession = useCallback(() => {
        setSessionError(null);
        void sessionFetcher.submit(null, { method: 'POST', action: sessionEndpoint });
    }, [sessionEndpoint, sessionFetcher]);

    // ── Voice mode ──────────────────────────────────────────────────────────
    const startVoiceMode = useCallback(() => setIsVoiceMode(true), []);
    const stopVoiceMode = useCallback(() => setIsVoiceMode(false), []);

    // ── Session end (from "End session" dropdown item) ──────────────────────
    const endSession = useCallback(() => {
        // Close SSE synchronously before DELETE so the server clearing the cookie
        // doesn't trigger an auto-reconnect 401 cycle (useEffect cleanup is async/post-paint).
        closeMiawEvents();
        void sessionFetcher.submit(null, { method: 'DELETE', action: sessionEndpoint });
        setIsSessionReady(false);
        setIsVoiceMode(false);
        setIsOpen(false);
        setSessionError(null);
        setMessages([]);
        setIsAgentTyping(false);
        sentIdsRef.current.clear();
    }, [sessionEndpoint, sessionFetcher, closeMiawEvents]);

    const clearMessages = useCallback(() => setMessages([]), []);

    const isSessionLoading = sessionFetcher.state !== 'idle' && !isSessionReady && !sessionError;

    return {
        isOpen,
        setIsOpen,
        isVoiceMode,
        startVoiceMode,
        stopVoiceMode,
        messages,
        sendMessage,
        clearMessages,
        endSession,
        retrySession,
        isAgentTyping,
        isSessionReady,
        isSessionLoading,
        sessionError,
    };
}
