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

import { Mic, MicOff, Volume2, VolumeOff, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AudioTrack, VideoTrack, type TrackReference } from '@livekit/components-react';

interface RunwayCharacterProps {
    isVisible: boolean;
    onExit?: () => void;
    isMicMuted: boolean;
    isSpeakerMuted: boolean;
    toggleMic: () => void;
    toggleSpeaker: () => void;
    videoTrack?: TrackReference;
    audioTrack?: TrackReference;
    /** Override the outer container's positioning classes. Defaults to fixed top-left overlay. */
    containerClassName?: string;
}

/**
 * Renders the Runway LiveAvatar character video overlay.
 * Uses @livekit/components-react VideoTrack/AudioTrack so the SDK manages DOM lifecycle.
 * Visibility is toggled with CSS only (hidden class) to keep the DOM element stable.
 */
export function RunwayCharacter({
    isVisible,
    onExit,
    isMicMuted,
    isSpeakerMuted,
    toggleMic,
    toggleSpeaker,
    videoTrack,
    audioTrack,
    containerClassName,
}: RunwayCharacterProps) {
    return (
        <>
            {audioTrack && <AudioTrack trackRef={audioTrack} aria-hidden />}
            <div
                className={cn(
                    containerClassName ?? 'fixed left-4 top-20 z-50',
                    'flex flex-col items-center gap-2',
                    !isVisible && 'hidden'
                )}
                aria-hidden={!isVisible}
                data-testid="runway-character">
                <div className="overflow-hidden rounded-2xl shadow-xl [--ui-radius:var(--radius-2xl)]">
                    {videoTrack ? (
                        <VideoTrack
                            trackRef={videoTrack}
                            autoPlay
                            playsInline
                            className="h-64 w-48 bg-black/100 object-cover"
                            aria-label="AI assistant character"
                        />
                    ) : (
                        <div className="h-64 w-48 bg-black/100" aria-hidden />
                    )}
                </div>

                <div className="flex gap-2 rounded-full bg-background/90 px-3 py-2 shadow-md backdrop-blur-sm">
                    <button
                        type="button"
                        onClick={toggleMic}
                        aria-label={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
                        className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                            isMicMuted
                                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}>
                        {isMicMuted ? (
                            <MicOff className="size-4" aria-hidden />
                        ) : (
                            <Mic className="size-4" aria-hidden />
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={toggleSpeaker}
                        aria-label={isSpeakerMuted ? 'Unmute character' : 'Mute character'}
                        className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                            isSpeakerMuted
                                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}>
                        {isSpeakerMuted ? (
                            <VolumeOff className="size-4" aria-hidden />
                        ) : (
                            <Volume2 className="size-4" aria-hidden />
                        )}
                    </button>

                    {onExit && (
                        <button
                            type="button"
                            onClick={onExit}
                            aria-label="Exit voice mode"
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80">
                            <X className="size-4" aria-hidden />
                        </button>
                    )}
                </div>
            </div>
        </>
    );
}
