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

import { LogOut, MoreVertical, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatHeaderProps {
  agentName: string;
  agentSubtitle: string;
  onClose: () => void;
  onClearChat: () => void;
  className?: string;
}

export function ChatHeader({ agentName, agentSubtitle, onClose, onClearChat, className }: ChatHeaderProps) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-between px-4 py-3',
        className,
      )}
    >
      <div className="flex flex-col">
        <span className="text-base font-semibold text-foreground">{agentName}</span>
        <span className="text-sm text-muted-foreground">{agentSubtitle}</span>
      </div>
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More options"
              className="flex h-8 w-8 items-center justify-end rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreVertical className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[10000] min-w-[9rem]">
            <DropdownMenuItem onClick={onClearChat}>
              <Trash2 className="size-4" aria-hidden />
              Clear chat
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                // TODO: end session logic (disconnect SCRT2 session, reset auth token)
              }}
            >
              <LogOut className="size-4" aria-hidden />
              End session
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close chat"
          className="flex h-8 w-8 items-center justify-end rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
