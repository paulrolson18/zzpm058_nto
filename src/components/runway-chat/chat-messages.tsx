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
import type { ChatMessage } from './use-runway-chat';

interface ChatMessagesProps {
  messages: ChatMessage[];
  className?: string;
}

export function ChatMessages({ messages, className }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className={cn('flex flex-1 flex-col gap-3 overflow-y-auto p-4', className)}>
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={cn(
            'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
            msg.role === 'user'
              ? 'ml-auto bg-primary text-primary-foreground'
              : 'mr-auto bg-muted text-foreground',
          )}
        >
          {msg.text}
        </div>
      ))}
      <div ref={bottomRef} aria-hidden />
    </div>
  );
}
