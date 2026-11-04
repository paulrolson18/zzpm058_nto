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

import { cn } from '@/lib/utils';
import { ChatCharacter } from './chat-character';
import { ChatHeader } from './chat-header';
import { ChatInput } from './chat-input';
import { ChatMessages } from './chat-messages';
import type { ChatMessage } from './use-runway-chat';

interface ChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
    agentName: string;
    agentSubtitle: string;
    tokenEndpoint: string;
    isVoiceMode: boolean;
    onStartVoiceMode: () => void;
    onStopVoiceMode: () => void;
    messages: ChatMessage[];
    onSendMessage: (text: string) => void;
    onClearChat: () => void;
    onEndSession: () => void;
    onRetrySession?: () => void;
    onUserTranscript?: (text: string) => void;
    onRegisterSpeak?: (fn: ((text: string) => void) | null) => void;
    characterVideoSrc?: string;
    voiceGreeting?: string;
    isAgentTyping?: boolean;
    isSessionLoading?: boolean;
    isHistoryLoading?: boolean;
    isSessionReady?: boolean;
    sessionError?: 'config' | 'service' | null;
}

export function ChatPanel({
    isOpen,
    onClose,
    agentName,
    agentSubtitle,
    tokenEndpoint,
    isVoiceMode,
    onStartVoiceMode,
    onStopVoiceMode,
    messages,
    onSendMessage,
    onClearChat,
    onEndSession,
    onRetrySession,
    onUserTranscript,
    onRegisterSpeak,
    characterVideoSrc,
    voiceGreeting,
    isAgentTyping,
    isSessionLoading,
    isHistoryLoading,
    isSessionReady,
    sessionError,
}: ChatPanelProps) {
    const inputDisabled = !isSessionReady || sessionError === 'config';

    return (
        <div
            role="dialog"
            aria-label={`Chat with ${agentName}`}
            aria-modal="false"
            className={cn(
                'fixed inset-y-0 right-0 z-[9998] flex w-[380px] max-w-full flex-col border-l border-border bg-background shadow-xl',
                'transition-transform duration-300 ease-in-out',
                isOpen ? 'translate-x-0' : 'translate-x-full'
            )}>
            {/* Shared wrapper: header + character section share the same horizontal padding so they align */}
            <div className="shrink-0 px-4">
                <ChatHeader
                    agentName={agentName}
                    agentSubtitle={agentSubtitle}
                    onClose={onClose}
                    onClearChat={onClearChat}
                    onEndSession={onEndSession}
                    className="px-0"
                />
                <ChatCharacter
                    tokenEndpoint={tokenEndpoint}
                    isVoiceMode={isVoiceMode}
                    onStartVoiceMode={onStartVoiceMode}
                    onStopVoiceMode={onStopVoiceMode}
                    onUserTranscript={onUserTranscript}
                    onRegisterSpeak={onRegisterSpeak}
                    characterVideoSrc={characterVideoSrc}
                    voiceGreeting={voiceGreeting}
                    agentName={agentName}
                    disabled={inputDisabled}
                />
            </div>

            <ChatMessages
                messages={messages}
                isAgentTyping={isAgentTyping}
                isSessionLoading={isSessionLoading}
                isHistoryLoading={isHistoryLoading}
                onSendMessage={onSendMessage}
                sessionError={sessionError}
                onRetrySession={onRetrySession}
            />

            <ChatInput onSendMessage={onSendMessage} onStartVoiceMode={onStartVoiceMode} disabled={inputDisabled} />
        </div>
    );
}
