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
import { parseStructuredResponse } from './parse-response';
import { useNavigate } from '@/hooks/use-navigate';

const GREETING_TIMEOUT_MS = 15_000;

// ── TTS helpers ────────────────────────────────────────────────────────────────

/** Removes markdown syntax from text intended for TTS — keeps the readable content, drops the markers. */
function stripMarkdown(text: string): string {
    return text
        .replace(/^#{1,6}\s+/gm, '')            // headings
        .replace(/^[-*_]{3,}\s*$/gm, '')         // horizontal rules
        .replace(/^>\s?/gm, '')                  // blockquotes
        .replace(/\*\*\*(.+?)\*\*\*/gs, '$1')    // bold+italic
        .replace(/___(.+?)___/gs, '$1')
        .replace(/\*\*(.+?)\*\*/gs, '$1')        // bold
        .replace(/__(.+?)__/gs, '$1')
        .replace(/\*([^*\n]+?)\*/g, '$1')        // italic
        .replace(/_([^_\n]+?)_/g, '$1')
        .replace(/~~(.+?)~~/gs, '$1')             // strikethrough
        .replace(/`([^`\n]+?)`/g, '$1')           // inline code
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links — keep visible text
        .replace(/^\d+\.\s+/gm, '')              // ordered list markers
        .replace(/^[-*+]\s+/gm, '');             // unordered list markers
}

function extractSpeakableText(text: string): string {
    const structured = parseStructuredResponse(text);
    if (structured) {
        const firstMarkdown = [...structured.response]
            .sort((a, b) => a.index - b.index)
            .find((b) => b.type === 'markdown');
        return firstMarkdown?.type === 'markdown' ? stripMarkdown(firstMarkdown.data.content) : '';
    }
    return stripMarkdown(text);
}

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
    historyEndpoint: string;
}

export function useRunwayChat({
    sessionEndpoint,
    messageEndpoint,
    eventsEndpoint,
    historyEndpoint,
}: UseRunwayChatOptions) {
    const [isOpen, setIsOpen] = useState(false);
    const [isVoiceMode, setIsVoiceMode] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isAgentTyping, setIsAgentTyping] = useState(false);
    const [isSessionReady, setIsSessionReady] = useState(false);
    const [sessionError, setSessionError] = useState<'config' | 'service' | null>(null);

    const navigate = useNavigate();

    const sessionFetcher = useFetcher<{ conversationId?: string; hasHistory?: boolean; error?: string }>();
    const messageFetcher = useFetcher<{ ok?: boolean; navigateTo?: string; error?: string }>();
    const historyFetcher = useFetcher<{ messages: ChatMessage[] }>();

    // Track IDs of messages we sent ourselves so we can skip their SSE echo
    const sentIdsRef = useRef(new Set<string>());

    // Ref mirrors for stable callbacks
    const isVoiceModeRef = useRef(isVoiceMode);
    isVoiceModeRef.current = isVoiceMode;
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    // Prevents onError from firing mid-send before the optimistic message commits to the ref.
    const hasSentMessageRef = useRef(false);
    // Distinguishes a retry DELETE from an end-session DELETE in sessionFetcher.data.
    const isRetryingRef = useRef(false);

    // Speak function registered by ChatCharacter when LiveKit is ready
    const speakFnRef = useRef<((text: string) => void) | null>(null);
    const registerSpeak = useCallback((fn: ((text: string) => void) | null) => {
        speakFnRef.current = fn;
    }, []);

    // Streaming TTS functions registered by ChatCharacter
    const speakChunkFnRef = useRef<((text: string, messageId: string) => void) | null>(null);
    const streamEndFnRef = useRef<((messageId: string) => void) | null>(null);
    const registerSpeakChunk = useCallback((fn: ((text: string, messageId: string) => void) | null) => {
        speakChunkFnRef.current = fn;
    }, []);
    const registerStreamEnd = useCallback((fn: ((messageId: string) => void) | null) => {
        streamEndFnRef.current = fn;
    }, []);

    // Tracks which message IDs were already spoken via streaming tokens (TTS dedup guard)
    const streamedMessageIdsRef = useRef(new Set<string>());
    // Accumulates streaming tokens per messageId so the chat can render progressively
    const streamingTokensRef = useRef(new Map<string, Array<{ type: string; index: number; data: unknown }>>());
    // Only the first markdown token per turn speaks TTS; this set records turns already spoken
    const hasSpokenTTSRef = useRef(new Set<string>());
    // Turns that received a CONVERSATION_PROGRESS_INDICATOR (triggers preliminary message split)
    const hasProgressRef = useRef(new Set<string>());
    // Turns where agent_stream_end was already sent early (prevents double-sending on TYPING_STOPPED)
    const streamEndSentRef = useRef(new Set<string>());

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
        } else if ('conversationId' in sessionFetcher.data) {
            setIsSessionReady(true);
            setSessionError(null);
            if (sessionFetcher.data.hasHistory) {
                void historyFetcher.load(historyEndpoint);
            }
        } else if ('ok' in sessionFetcher.data && isRetryingRef.current) {
            // Retry DELETE cleared the cookie — now create a fresh session.
            isRetryingRef.current = false;
            void sessionFetcher.submit(null, { method: 'POST', action: sessionEndpoint });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionFetcher.data]);

    useEffect(() => {
        if (!historyFetcher.data?.messages.length) return;
        setMessages(historyFetcher.data.messages);
    }, [historyFetcher.data]);

    // ── Greeting timeout — fallback for connections that hang without erroring ──
    useEffect(() => {
        if (!isSessionReady || messagesRef.current.length > 0) return;
        const timer = setTimeout(() => {
            if (messagesRef.current.length === 0) {
                setSessionError('service');
            }
        }, GREETING_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [isSessionReady]);

    // ── Message send errors (e.g. MIAW session expired / service down) ─────
    useEffect(() => {
        if (messageFetcher.data?.error) {
            setSessionError('service');
        }
    }, [messageFetcher.data]);

    // ── Navigation intent ───────────────────────────────────────────────────
    const handledNavigateRef = useRef<string | null>(null);
    useEffect(() => {
        const url = messageFetcher.data?.navigateTo;
        if (url && url !== handledNavigateRef.current) {
            handledNavigateRef.current = url;
            navigate(url);
        }
    }, [messageFetcher.data, navigate]);

    // ── Inbound agent messages via SSE ──────────────────────────────────────
    const { close: closeMiawEvents } = useMiawEvents({
        eventsUrl: eventsEndpoint,
        enabled: isOpen && isSessionReady,
        onError: useCallback(() => {
            // Ignore mid-session reconnects and the race window during first send.
            if (messagesRef.current.length === 0 && !hasSentMessageRef.current) {
                setSessionError('service');
            }
        }, []),
        onAgentMessage: useCallback((text: string, messageId: string) => {
            // Receiving a message always means typing has stopped, regardless of event order
            setIsAgentTyping(false);
            // If the greeting timeout fired before this message arrived, dismiss the error — the
            // connection was just slow, not broken.
            setSessionError((prev) => (prev === 'service' ? null : prev));
            if (sentIdsRef.current.has(messageId)) {
                sentIdsRef.current.delete(messageId);
                return;
            }
            const wasStreamed = streamingTokensRef.current.has(messageId);
            streamingTokensRef.current.delete(messageId);
            if (wasStreamed) {
                // Replace the streaming placeholder with the final complete message text
                setMessages((prev) =>
                    prev.map((m) => (m.id === messageId ? { ...m, text } : m)),
                );
            } else {
                setMessages((prev) => [
                    ...prev,
                    { id: messageId || `agent-${Date.now()}`, role: 'agent', text, timestamp: new Date() },
                ]);
            }
            // Skip TTS — this message was already spoken via streaming tokens
            if (streamedMessageIdsRef.current.has(messageId)) {
                streamedMessageIdsRef.current.delete(messageId);
                return;
            }
            // Fallback: speak via full message when streaming tokens were not available
            if (isVoiceModeRef.current && speakFnRef.current) {
                const speakable = extractSpeakableText(text);
                if (speakable) speakFnRef.current(speakable);
            }
        }, []),
        onStreamingToken: useCallback((token: { type: string; index: number; data: unknown }, messageId: string) => {
            // Accumulate token and update chat message progressively (all modes)
            const tokens = streamingTokensRef.current.get(messageId) ?? [];
            tokens.push(token);
            streamingTokensRef.current.set(messageId, tokens);
            const partialText = JSON.stringify({ response: tokens });
            setIsAgentTyping(false);
            setMessages((prev) => {
                const exists = prev.some((m) => m.id === messageId);
                if (!exists) {
                    return [...prev, { id: messageId, role: 'agent', text: partialText, timestamp: new Date() }];
                }
                return prev.map((m) => (m.id === messageId ? { ...m, text: partialText } : m));
            });
            // TTS: only the very first markdown token per turn (preliminary acknowledgment)
            if (token.type === 'markdown' && isVoiceModeRef.current && speakChunkFnRef.current
                    && !hasSpokenTTSRef.current.has(messageId)) {
                const content = (token.data as { content?: string } | undefined)?.content ?? '';
                if (content) {
                    hasSpokenTTSRef.current.add(messageId);
                    streamedMessageIdsRef.current.add(messageId);
                    speakChunkFnRef.current(stripMarkdown(content), messageId);
                }
            }
        }, []),
        onStreamEnd: useCallback((messageId: string) => {
            // Skip if stream_end was already sent early when the progress indicator arrived
            if (streamEndSentRef.current.has(messageId)) return;
            if (isVoiceModeRef.current && streamEndFnRef.current
                    && streamedMessageIdsRef.current.has(messageId)) {
                streamEndFnRef.current(messageId);
            }
        }, []),
        onProgressIndicator: useCallback((messageId: string) => {
            if (hasProgressRef.current.has(messageId)) return;
            hasProgressRef.current.add(messageId);
            // Split: lock the preliminary message under a stable id, start fresh for the actual response
            if (streamingTokensRef.current.has(messageId)) {
                streamingTokensRef.current.delete(messageId);
                setMessages((prev) =>
                    prev.map((m) => (m.id === messageId ? { ...m, id: `${messageId}-prelim` } : m)),
                );
            }
            // End the streaming TTS immediately so the agent finishes the preliminary text
            if (isVoiceModeRef.current && streamEndFnRef.current
                    && hasSpokenTTSRef.current.has(messageId)) {
                streamEndSentRef.current.add(messageId);
                streamEndFnRef.current(messageId);
            }
        }, []),
        onTyping: useCallback((isTyping: boolean) => setIsAgentTyping(isTyping), []),
    });

    // ── Outbound message ────────────────────────────────────────────────────
    const sendMessage = useCallback(
        (text: string) => {
            if (!text.trim() || !isSessionReady) return;
            hasSentMessageRef.current = true;
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
        hasSentMessageRef.current = false;
        isRetryingRef.current = true;
        // Clear the stale cookie before the POST so we always get a fresh conversation.
        closeMiawEvents();
        setIsSessionReady(false);
        setSessionError(null);
        void sessionFetcher.submit(null, { method: 'DELETE', action: sessionEndpoint });
    }, [sessionEndpoint, sessionFetcher, closeMiawEvents]);

    // ── Voice mode ──────────────────────────────────────────────────────────
    const startVoiceMode = useCallback(() => setIsVoiceMode(true), []);
    const stopVoiceMode = useCallback(() => setIsVoiceMode(false), []);

    // ── Session end (from "End session" dropdown item) ──────────────────────
    const endSession = useCallback(() => {
        // Close SSE synchronously before DELETE so the server clearing the cookie
        // doesn't trigger an auto-reconnect 401 cycle (useEffect cleanup is async/post-paint).
        closeMiawEvents();
        void sessionFetcher.submit(null, { method: 'DELETE', action: sessionEndpoint });
        hasSentMessageRef.current = false;
        setIsSessionReady(false);
        setIsVoiceMode(false);
        setIsOpen(false);
        setSessionError(null);
        setMessages([]);
        setIsAgentTyping(false);
        sentIdsRef.current.clear();
        streamedMessageIdsRef.current.clear();
        streamingTokensRef.current.clear();
        hasSpokenTTSRef.current.clear();
        hasProgressRef.current.clear();
        streamEndSentRef.current.clear();
    }, [sessionEndpoint, sessionFetcher, closeMiawEvents]);

    const clearMessages = useCallback(() => setMessages([]), []);

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
        registerSpeak,
        registerSpeakChunk,
        registerStreamEnd,
        isAgentTyping,
        isSessionReady,
        sessionError,
    };
}
