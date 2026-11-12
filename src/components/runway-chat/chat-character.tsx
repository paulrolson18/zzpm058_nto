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

import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useRoomContext,
  useTracks,
  VideoTrack,
  type TrackReference,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import {
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLivekitToken } from "@/hooks/runway/use-livekit-room";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ component: "runway-chat" });

const DEFAULT_VOICE_GREETING =
  "Hey! I'm Carter, your NTO stylist. What are we looking for today?";

const GifBase = memo(({ src }: { src?: string }) =>
  src ? (
    <img
      src={src}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      aria-hidden
    />
  ) : (
    <div className="absolute inset-0 bg-muted" aria-hidden />
  ),
);

interface PanelCharacterRoomProps {
  onExit: () => void;
  /** Called when the LiveKit agent sends a user speech transcript. */
  onUserTranscript?: (text: string) => void;
  /** Called with a speak function on mount so the parent can trigger TTS; called with null on cleanup. */
  onRegisterSpeak?: (fn: ((text: string) => void) | null) => void;
  /** Greeting text spoken when the character first connects. Mic is locked until it finishes. */
  voiceGreeting?: string;
  agentName?: string;
  /** Called when the first video frame plays — used by the parent to fade out the cover overlay. */
  onVideoReady?: () => void;
}

function PanelCharacterRoom({
  onExit,
  onUserTranscript,
  onRegisterSpeak,
  voiceGreeting = DEFAULT_VOICE_GREETING,
  agentName,
  onVideoReady,
}: PanelCharacterRoomProps) {
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isGreeting, setIsGreeting] = useState(true);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);

  const isGreetingRef = useRef(true);
  isGreetingRef.current = isGreeting;

  const videoTracks = useTracks([Track.Source.Camera], {
    onlySubscribed: true,
  });
  const videoTrack = videoTracks[0] as TrackReference | undefined;

  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();

  const sendJsonData = useCallback(
    (payload: unknown) => {
      void room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(payload)),
        {
          reliable: true,
        },
      );
    },
    [room],
  );

  useEffect(() => {
    const handleData = (payload: Uint8Array) => {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(payload)) as {
          type: string;
          text?: string;
        };
        if (parsed.type === "agent_ready") {
          logger.info("[runway-chat] agent_ready — sending greeting");
          sendJsonData({ type: "agent_text", text: voiceGreeting });
        }
        if (parsed.type === "user_transcript" && parsed.text) {
          onUserTranscript?.(parsed.text);
        }
        if (parsed.type === "speech_finished" && isGreetingRef.current) {
          setIsGreeting(false);
          sendJsonData({ type: "voice_mode", enabled: true });
        }
      } catch (e) {
        logger.warn("[runway-chat] data parse error", { error: String(e) });
      }
    };
    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room, onUserTranscript, sendJsonData]);

  // Register the speak function so use-runway-chat can trigger TTS on agent replies
  useEffect(() => {
    onRegisterSpeak?.((text) => sendJsonData({ type: "agent_text", text }));
    return () => {
      onRegisterSpeak?.(null);
    };
  }, [sendJsonData, onRegisterSpeak]);

  const toggleMic = useCallback(() => {
    setIsMicMuted((prev) => {
      const next = !prev;
      void localParticipant.setMicrophoneEnabled(!next);
      return next;
    });
  }, [localParticipant]);

  const toggleSpeaker = useCallback(
    () => setIsSpeakerMuted((prev) => !prev),
    [],
  );

  // All children are absolute — they position themselves inside the parent's relative container.
  return (
    <>
      <RoomAudioRenderer muted={isSpeakerMuted} />

      {/* Live video — fills the parent's coordinate space */}
      <div className="absolute inset-0 overflow-hidden">
        {videoTrack && (
          <VideoTrack
            trackRef={videoTrack}
            autoPlay
            playsInline
            className={cn(
              "h-full w-full object-cover transition-opacity duration-700",
              isVideoReady ? "opacity-100" : "opacity-0",
            )}
            aria-label="AI assistant character"
            onPlay={() => {
              setIsVideoReady(true);
              onVideoReady?.();
            }}
          />
        )}
      </div>

      {/* Connecting overlay — fades out when the video's first frame is playing */}
      <div
        className={cn(
          "absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 transition-opacity duration-700",
          isVideoReady ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        <Loader2 className="size-6 animate-spin text-white [filter:drop-shadow(0_1px_3px_rgb(0_0_0/0.8))]" aria-hidden />
        <p className="text-sm font-medium text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]">
          Connecting to {agentName ?? "Carter"}
        </p>
      </div>

      {/* Controls — fade in with the video reveal */}
      <div className={cn(
        "absolute bottom-0 left-0 right-0 z-20 flex justify-center gap-2 bg-gradient-to-t from-black/60 to-transparent pb-4 pt-10 transition-opacity duration-700",
        isVideoReady ? "opacity-100" : "pointer-events-none opacity-0",
      )}>
        <button
          type="button"
          onClick={isGreeting ? undefined : toggleMic}
          disabled={isGreeting}
          aria-label={
            isGreeting
              ? "Shopper is speaking…"
              : isMicMuted
                ? "Unmute microphone"
                : "Mute microphone"
          }
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
            isGreeting
              ? "cursor-not-allowed bg-white/10 text-white/40"
              : isMicMuted
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "bg-white/20 text-white backdrop-blur-sm hover:bg-white/30",
          )}
        >
          {isGreeting ? (
            <span
              className="size-2 animate-pulse rounded-full bg-white/40"
              aria-hidden
            />
          ) : isMicMuted ? (
            <MicOff className="size-4" aria-hidden />
          ) : (
            <Mic className="size-4" aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={toggleSpeaker}
          aria-label={isSpeakerMuted ? "Unmute character" : "Mute character"}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
            isSpeakerMuted
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-white/20 text-white backdrop-blur-sm hover:bg-white/30",
          )}
        >
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
          className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground transition-colors hover:bg-destructive/90"
        >
          <PhoneOff className="size-4" aria-hidden />
        </button>
      </div>
    </>
  );
}

interface ChatCharacterProps {
  tokenEndpoint: string;
  isVoiceMode: boolean;
  onStartVoiceMode: () => void;
  onStopVoiceMode: () => void;
  /** Called when the LiveKit agent provides a user speech transcript. */
  onUserTranscript?: (text: string) => void;
  /** Called with a speak function on LiveKit connect; null on disconnect. */
  onRegisterSpeak?: (fn: ((text: string) => void) | null) => void;
  characterVideoSrc?: string;
  agentName?: string;
  /** Disables the voice mode button while the chat session is initializing. */
  disabled?: boolean;
  /** Greeting spoken when the character first connects. Mic is locked until greeting finishes. */
  voiceGreeting?: string;
}

export function ChatCharacter({
  tokenEndpoint,
  isVoiceMode,
  onStartVoiceMode,
  onStopVoiceMode,
  onUserTranscript,
  onRegisterSpeak,
  characterVideoSrc,
  agentName = "NTO Agent",
  disabled = false,
  voiceGreeting,
}: ChatCharacterProps) {
  const { token, livekitUrl, isError } = useLivekitToken(
    tokenEndpoint,
    isVoiceMode,
  );

  useEffect(() => {
    if (isError) {
      logger.warn("[runway-chat] token error — exiting voice mode");
      onStopVoiceMode();
    }
  }, [isError, onStopVoiceMode]);

  const showIdle = !isVoiceMode;
  const showTokenLoading = isVoiceMode && (!token || !livekitUrl);

  // Ref for the dark cover overlay — manipulated directly so the fade starts in the same
  // browser frame as onPlay, without waiting for a React render cycle.
  const coverOverlayRef = useRef<HTMLDivElement>(null);
  const handleVideoReady = useCallback(() => {
    const el = coverOverlayRef.current;
    if (!el) return;
    el.style.transition = "opacity 700ms ease-in-out";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
  }, []);

  return (
    <div
      className="relative w-full shrink-0 overflow-hidden bg-black"
      style={{ aspectRatio: "16/9" }}
    >
      {/* GifBase at stable position 0 — never unmounts across state transitions */}
      <GifBase src={characterVideoSrc} />

      {/* Dark cover — spans the full connection phase (token fetch → LiveKit mount → first video
          frame). Sits above GifBase (z-auto) but below PanelCharacterRoom overlays (z-10/z-20)
          so "Connecting to Carter" text remains visible. Faded out imperatively via ref when the
          first video frame plays; unmounts when voice mode ends so it resets for the next call. */}
      {isVoiceMode && (
        <div
          ref={coverOverlayRef}
          className="absolute inset-0 z-[5] bg-black/60"
          aria-hidden
        />
      )}

      {/* Idle overlay */}
      <div
        className={cn(
          "absolute inset-0 flex items-end justify-center pb-5",
          showIdle ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <button
          type="button"
          onClick={disabled ? undefined : onStartVoiceMode}
          disabled={disabled}
          aria-label={`Speak with ${agentName}`}
          className={cn(
            "flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            disabled
              ? "cursor-not-allowed bg-primary/50 text-primary-foreground/60"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          <Mic className="size-4" aria-hidden />
          {`Speak with ${agentName}`}
        </button>
      </div>

      {/* Token-loading overlay */}
      <div
        className={cn(
          "absolute inset-0 flex flex-col items-center justify-center gap-2",
          showTokenLoading ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <Loader2 className="size-6 animate-spin text-white [filter:drop-shadow(0_1px_3px_rgb(0_0_0/0.8))]" aria-hidden />
        <p className="text-sm font-medium text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.8)]">
          Connecting to {agentName}
        </p>
      </div>

      {/* LiveKit room — video + connecting overlay + controls, all absolute inside this container */}
      {isVoiceMode && token && livekitUrl && (
        <LiveKitRoom
          serverUrl={livekitUrl}
          token={token}
          audio={true}
          video={false}
          connect={true}
          onDisconnected={onStopVoiceMode}
          style={{ display: "contents" }}
        >
          <PanelCharacterRoom
            onExit={onStopVoiceMode}
            onUserTranscript={onUserTranscript}
            onRegisterSpeak={onRegisterSpeak}
            voiceGreeting={voiceGreeting}
            agentName={agentName}
            onVideoReady={handleVideoReady}
          />
        </LiveKitRoom>
      )}
    </div>
  );
}
