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

import { useCallback, useEffect, useState } from 'react';
import {
    AudioTrack,
    LiveKitRoom,
    useLocalParticipant,
    useRoomContext,
    useTracks,
    VideoTrack,
    type TrackReference,
} from '@livekit/components-react';
import { RoomEvent, Track } from 'livekit-client';
import { Loader2, Mic, MicOff, PhoneOff, Volume2, VolumeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLivekitToken } from '@/hooks/runway/use-livekit-room';
import { createLogger } from '@/lib/logger';

const logger = createLogger({ component: 'runway-chat' });

interface PanelCharacterRoomProps {
    onExit: () => void;
    /** Called when the LiveKit agent sends a user speech transcript. */
    onUserTranscript?: (text: string) => void;
}

function PanelCharacterRoom({ onExit, onUserTranscript }: PanelCharacterRoomProps) {
    const [isAgentReady, setIsAgentReady] = useState(false);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);

    const videoTracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
    const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true });
    const videoTrack = videoTracks[0] as TrackReference | undefined;
    const audioTrack = audioTracks[0] as TrackReference | undefined;

    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();

    const sendJsonData = useCallback(
        (payload: unknown) => {
            void room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(payload)), {
                reliable: true,
            });
        },
        [room]
    );

    useEffect(() => {
        const handleData = (payload: Uint8Array) => {
            try {
                const parsed = JSON.parse(new TextDecoder().decode(payload)) as {
                    type: string;
                    text?: string;
                };
                if (parsed.type === 'agent_ready') {
                    logger.info('[runway-chat] agent_ready — showing character');
                    setIsAgentReady(true);
                }
                // User speech transcript from the LiveKit agent
                if (parsed.type === 'user_transcript' && parsed.text) {
                    onUserTranscript?.(parsed.text);
                }
            } catch (e) {
                logger.warn('[runway-chat] data parse error', { error: String(e) });
            }
        };
        room.on(RoomEvent.DataReceived, handleData);
        return () => {
            room.off(RoomEvent.DataReceived, handleData);
        };
    }, [room, onUserTranscript]);

    useEffect(() => {
        if (isAgentReady) {
            sendJsonData({ type: 'voice_mode', enabled: true });
        }
    }, [isAgentReady, sendJsonData]);

    const toggleMic = useCallback(() => {
        setIsMicMuted((prev) => {
            const next = !prev;
            void localParticipant.setMicrophoneEnabled(!next);
            return next;
        });
    }, [localParticipant]);

    const toggleSpeaker = useCallback(() => setIsSpeakerMuted((prev) => !prev), []);

    return (
        <div className="relative flex w-full flex-col">
            {!isSpeakerMuted && audioTrack && <AudioTrack trackRef={audioTrack} aria-hidden />}

            <div
                className={cn('relative w-full overflow-hidden bg-black/100', !isAgentReady && 'hidden')}
                style={{ aspectRatio: '4/3' }}>
                {videoTrack ? (
                    <VideoTrack
                        trackRef={videoTrack}
                        autoPlay
                        playsInline
                        className="h-full w-full object-cover"
                        aria-label="AI assistant character"
                    />
                ) : (
                    <div className="h-full w-full bg-black/100" aria-hidden />
                )}
            </div>

            {!isAgentReady && (
                <div className="flex w-full items-center justify-center bg-black/100" style={{ aspectRatio: '4/3' }}>
                    <Loader2 className="size-8 animate-spin text-white/60" aria-label="Connecting to AI assistant" />
                </div>
            )}

            <div className="flex justify-center gap-2 px-4 py-3">
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
                    {isMicMuted ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
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
                <button
                    type="button"
                    onClick={onExit}
                    aria-label="Exit voice mode"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90">
                    <PhoneOff className="size-4" aria-hidden />
                </button>
            </div>
        </div>
    );
}

interface ChatCharacterProps {
    tokenEndpoint: string;
    isVoiceMode: boolean;
    onStartVoiceMode: () => void;
    onStopVoiceMode: () => void;
    /** Called when the LiveKit agent provides a user speech transcript. */
    onUserTranscript?: (text: string) => void;
    characterVideoSrc?: string;
    agentName?: string;
}

export function ChatCharacter({
    tokenEndpoint,
    isVoiceMode,
    onStartVoiceMode,
    onStopVoiceMode,
    onUserTranscript,
    characterVideoSrc,
    agentName = 'NTO Agent',
}: ChatCharacterProps) {
    const { token, livekitUrl, isError } = useLivekitToken(tokenEndpoint, isVoiceMode);

    useEffect(() => {
        if (isError) {
            logger.warn('[runway-chat] token error — exiting voice mode');
            onStopVoiceMode();
        }
    }, [isError, onStopVoiceMode]);

    if (!isVoiceMode) {
        return (
            <div className="relative w-full shrink-0 overflow-hidden bg-black/100" style={{ aspectRatio: '4/3' }}>
                {characterVideoSrc ? (
                    <video
                        src={characterVideoSrc}
                        loop
                        autoPlay
                        muted
                        playsInline
                        className="h-full w-full object-cover"
                        aria-hidden
                    />
                ) : (
                    <div className="h-full w-full bg-muted" aria-hidden />
                )}
                <div className="absolute inset-0 flex items-end justify-center pb-5">
                    <button
                        type="button"
                        onClick={onStartVoiceMode}
                        className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-lg transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Mic className="size-4" aria-hidden />
                        {`Speak with ${agentName}`}
                    </button>
                </div>
            </div>
        );
    }

    if (!token || !livekitUrl) {
        return (
            <div
                className="flex w-full shrink-0 items-center justify-center bg-black/100"
                style={{ aspectRatio: '4/3' }}>
                <Loader2 className="size-8 animate-spin text-white/60" aria-label="Connecting to AI assistant" />
            </div>
        );
    }

    return (
        <LiveKitRoom
            serverUrl={livekitUrl}
            token={token}
            audio={true}
            video={false}
            connect={true}
            onDisconnected={onStopVoiceMode}
            style={{ display: 'contents' }}>
            <PanelCharacterRoom onExit={onStopVoiceMode} onUserTranscript={onUserTranscript} />
        </LiveKitRoom>
    );
}
