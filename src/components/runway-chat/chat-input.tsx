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

import { useRef, useState } from 'react';
import { ArrowRight, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
    onSendMessage: (text: string) => void;
    onStartVoiceMode: () => void;
    placeholder?: string;
    className?: string;
}

export function ChatInput({
    onSendMessage,
    onStartVoiceMode,
    placeholder = 'Ask Shopper Agent a question',
    className,
}: ChatInputProps) {
    const [value, setValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSend = () => {
        const trimmed = value.trim();
        if (!trimmed) return;
        onSendMessage(trimmed);
        setValue('');
        inputRef.current?.focus();
    };

    return (
        <div className={cn('flex shrink-0 items-center gap-2 border-t border-border px-4 py-3', className)}>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                    }
                }}
                placeholder={placeholder}
                aria-label="Message input"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
                type="button"
                onClick={onStartVoiceMode}
                aria-label="Start voice mode"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Mic className="size-4" aria-hidden />
            </button>
            <button
                type="button"
                onClick={handleSend}
                disabled={!value.trim()}
                aria-label="Send message"
                className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    value.trim()
                        ? 'bg-muted text-foreground hover:bg-muted/80'
                        : 'cursor-not-allowed bg-muted/50 text-muted-foreground'
                )}>
                <ArrowRight className="size-4" aria-hidden />
            </button>
        </div>
    );
}
