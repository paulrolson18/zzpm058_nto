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

export function ChatSkeleton() {
    return (
        <div className="flex flex-col gap-3 p-4" aria-label="Connecting to agent" aria-busy="true">
            <div className="h-14 w-[80%] animate-pulse rounded-2xl rounded-tl-sm bg-muted-foreground/20" />
            <div className="ml-auto h-9 w-[45%] animate-pulse rounded-2xl rounded-tr-sm bg-muted-foreground/20" />
            <div className="h-12 w-[70%] animate-pulse rounded-2xl rounded-tl-sm bg-muted-foreground/20" />
            <div className="ml-auto h-9 w-[35%] animate-pulse rounded-2xl rounded-tr-sm bg-muted-foreground/20" />
            <div className="h-16 w-[75%] animate-pulse rounded-2xl rounded-tl-sm bg-muted-foreground/20" />
        </div>
    );
}
