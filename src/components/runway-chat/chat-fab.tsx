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

import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatFabProps {
  onClick: () => void;
  className?: string;
}

export function ChatFab({ onClick, className }: ChatFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open AI Shopper Agent"
      className={cn(
        'fixed bottom-6 right-6 z-[9999] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <MessageCircle className="size-6" aria-hidden />
    </button>
  );
}
