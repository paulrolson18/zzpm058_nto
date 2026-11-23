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
import { cn } from '@/lib/utils';
import { MessageContent } from './message-content';
import { ChatSkeleton } from './chat-skeleton';
import type { ChatMessage } from './use-runway-chat';

interface ChatMessagesProps {
    messages: ChatMessage[];
    isAgentTyping?: boolean;
    onSendMessage?: (text: string) => void;
    sessionError?: 'config' | 'service' | null;
    onRetrySession?: () => void;
    className?: string;
}


function shouldShowSkeleton(
    messages: ChatMessage[],
    sessionError: 'config' | 'service' | null | undefined
): boolean {
    return messages.length === 0 && !sessionError;
}

function SessionError({ kind, onRetry }: { kind: 'config' | 'service'; onRetry?: () => void }) {
    if (kind === 'config') {
        return (
            <div className="flex flex-col gap-1.5 rounded-2xl bg-muted px-4 py-3 text-sm">
                <p className="font-medium text-foreground">Chat unavailable</p>
                <p className="text-xs text-muted-foreground">
                    This feature isn&apos;t set up yet. Contact support for help.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 rounded-2xl bg-muted px-4 py-3 text-sm">
            <p className="font-medium text-foreground">Connection failed</p>
            <p className="text-xs text-muted-foreground">We couldn&apos;t reach the agent. Please try again.</p>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="self-start rounded-full border border-border bg-background px-3 py-1 text-xs font-medium transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Try again
                </button>
            )}
        </div>
    );
}

export function ChatMessages({
    messages,
    isAgentTyping,
    onSendMessage,
    sessionError,
    onRetrySession,
    className,
}: ChatMessagesProps) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const lastUserMsgRef = useRef<HTMLDivElement>(null);
    // Resets to false when the user sends a message, becomes true once the first agent message
    // appears. All subsequent agent events (streaming updates, second bubble) are ignored.
    const hasScrolledForResponseRef = useRef(false);
    const showSkeleton = shouldShowSkeleton(messages, sessionError);

    const lastMsg = messages[messages.length - 1];

    useEffect(() => {
        // User message: pin it to the top of the viewport so the response unfolds below.
        if (lastMsg?.role === 'user') {
            hasScrolledForResponseRef.current = false;
            lastUserMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        // Typing indicator while awaiting the first response.
        if (isAgentTyping && !hasScrolledForResponseRef.current) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
            return;
        }
        // First agent message in this turn: scroll once, then stop.
        if (lastMsg?.role === 'agent' && !hasScrolledForResponseRef.current) {
            hasScrolledForResponseRef.current = true;
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
        // Streaming updates and additional agent bubbles: no scroll.
    }, [messages, isAgentTyping, lastMsg?.role]);

    return (
        <div className={cn('flex flex-1 flex-col overflow-x-hidden overflow-y-auto', className)}>
            {/* Skeleton — removed from DOM as soon as messages or an error arrive */}
            {showSkeleton && <ChatSkeleton />}

            {/* Error state — shown instead of skeleton when session init fails */}
            {sessionError && (
                <div className="p-4">
                    <SessionError kind={sessionError} onRetry={onRetrySession} />
                </div>
            )}

            {/* Messages — only rendered once the first message exists */}
            {(messages.length > 0 || isAgentTyping) && (
                <div className="flex flex-col gap-3 p-4">
                    {messages.map((msg, i) =>
                        msg.role === 'user' ? (
                            <div
                                key={msg.id}
                                ref={i === messages.length - 1 ? lastUserMsgRef : undefined}
                                className="ml-auto max-w-[80%] rounded-2xl bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                                {msg.text}
                            </div>
                        ) : (
                            <div key={msg.id} className="w-full">
                                <MessageContent text={msg.text} onSuggestionClick={onSendMessage} />
                            </div>
                        )
                    )}
                    {isAgentTyping && (
                        <div
                            className="mr-auto flex items-center gap-1 rounded-2xl bg-muted px-4 py-3"
                            aria-label="Agent is typing">
                            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                            <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                        </div>
                    )}
                    <div ref={bottomRef} aria-hidden />
                </div>
            )}
        </div>
    );
}
