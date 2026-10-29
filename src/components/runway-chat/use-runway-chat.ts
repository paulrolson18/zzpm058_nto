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

import { useCallback, useState } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: Date;
}

interface UseRunwayChatOptions {
  scrt2Url: string;
}

export function useRunwayChat({ scrt2Url: _scrt2Url }: UseRunwayChatOptions) {
  const [isOpen, setIsOpen] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const startVoiceMode = useCallback(() => setIsVoiceMode(true), []);
  const stopVoiceMode = useCallback(() => setIsVoiceMode(false), []);

  const addMessage = useCallback((role: 'user' | 'agent', text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${role}-${Math.random()}`, role, text, timestamp: new Date() },
    ]);
  }, []);

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      addMessage('user', text);
      // TODO: wire outgoing message to SCRT2 API when available
    },
    [addMessage],
  );

  const addAgentMessage = useCallback(
    (text: string) => {
      addMessage('agent', text);
    },
    [addMessage],
  );

  const clearMessages = useCallback(() => setMessages([]), []);

  return {
    isOpen,
    setIsOpen,
    isVoiceMode,
    startVoiceMode,
    stopVoiceMode,
    messages,
    sendMessage,
    addAgentMessage,
    clearMessages,
  };
}
