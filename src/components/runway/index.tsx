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

import { useCallback, useEffect, useState } from "react";
import {
  LiveKitRoom,
  useLocalParticipant,
  useRoomContext,
  useTracks,
  type TrackReference,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import { Loader2, Mic } from "lucide-react";
import { RunwayCharacter } from "./runway-character";
import { useLivekitToken } from "@/hooks/runway/use-livekit-room";
import { useScrt2Intercept } from "@/hooks/runway/use-scrt2-intercept";
import { useCurrentSiteAndLocaleRef } from "@/hooks/use-current-site-and-locale-ref";
import { validateRunwayConfig, extractSpeakText, type RunwayConfig } from "../../utils/runway.utils";
import { createLogger } from "@/lib/logger";

const logger = createLogger({ component: "runway" });

/** Custom event that triggers eager chunk load before requestIdleCallback fires. */
export const RUNWAY_LOAD_EVENT = "runway:load";

interface RunwayCharacterRoomProps {
  scrt2Url: string;
  onExit: () => void;
}

function RunwayCharacterRoom({ scrt2Url, onExit }: RunwayCharacterRoomProps) {
  const [isAgentReady, setIsAgentReady] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);

  const videoTracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const audioTracks = useTracks([Track.Source.Microphone], { onlySubscribed: true });
  const videoTrack = videoTracks[0] as TrackReference | undefined;
  const audioTrack = audioTracks[0] as TrackReference | undefined;

  const room = useRoomContext();

  const sendJsonData = useCallback(
    (payload: unknown) => {
      void room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(payload)),
        { reliable: true },
      );
    },
    [room],
  );

  useEffect(() => {
    const handleData = (payload: Uint8Array) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload)) as {
          type: string;
          text?: string;
        };
        logger.debug("[runway] data received", { type: data.type });
        if (data.type === "agent_ready") {
          logger.info("[runway] agent_ready received — showing character");
          setIsAgentReady(true);
        } else if (data.type === "user_transcript" && data.text) {
          const text = data.text.trim();
          logger.info("[runway] user_transcript received", { text });
        }
      } catch (e) {
        logger.warn("[runway] data parse error", { error: String(e) });
      }
    };
    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  useEffect(() => {
    if (isAgentReady) {
      logger.debug("[runway] sending voice_mode enabled to agent");
      sendJsonData({ type: "voice_mode", enabled: true });
    }
  }, [isAgentReady, sendJsonData]);

  useScrt2Intercept(scrt2Url, (json) => {
    const speakText = extractSpeakText(json);
    if (speakText) {
      logger.debug("[runway] sending agent_text from SCRT2 intercept", { speakText });
      sendJsonData({ type: "agent_text", text: speakText });
    }
  });

  const { localParticipant } = useLocalParticipant();

  const toggleMic = useCallback(() => {
    setIsMicMuted((prev) => {
      const next = !prev;
      void localParticipant.setMicrophoneEnabled(!next);
      return next;
    });
  }, [localParticipant]);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerMuted((prev) => !prev);
  }, []);

  return (
    <RunwayCharacter
      isVisible={isAgentReady}
      onExit={onExit}
      isMicMuted={isMicMuted}
      isSpeakerMuted={isSpeakerMuted}
      toggleMic={toggleMic}
      toggleSpeaker={toggleSpeaker}
      videoTrack={videoTrack}
      audioTrack={isSpeakerMuted ? undefined : audioTrack}
    />
  );
}
interface RunwayAgentInnerProps {
  config: RunwayConfig;
  scrt2Url: string;
}

function RunwayAgentInner({ config, scrt2Url }: RunwayAgentInnerProps) {
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const { siteRef, localeRef } = useCurrentSiteAndLocaleRef();
  const tokenEndpoint =
    config.tokenEndpoint || `/${siteRef}/${localeRef}/api/runway-token`;

  const { token, livekitUrl, isError } = useLivekitToken(tokenEndpoint, isVoiceMode);

  const exitVoiceMode = useCallback(() => {
    logger.info("[runway] exiting voice mode");
    setIsVoiceMode(false);
  }, []);

  useEffect(() => {
    if (isError) {
      logger.warn("[runway] token/connection error — resetting to mic button");
      setIsVoiceMode(false);
    }
  }, [isError]);

  if (!isVoiceMode) {
    return (
      <button
        type="button"
        onClick={() => {
          logger.info("[runway] voice mode activated", { tokenEndpoint });
          setIsVoiceMode(true);
        }}
        aria-label="Start voice mode"
        className="fixed left-4 top-20 z-[9999] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
      >
        <Mic className="size-5" aria-hidden />
      </button>
    );
  }

  if (!token || !livekitUrl) {
    return (
      <div
        className="fixed left-4 top-20 z-[9999] flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        aria-label="Connecting to voice assistant"
      >
        <Loader2 className="size-5 animate-spin" aria-hidden />
      </div>
    );
  }

  logger.info("[runway] LiveKitRoom connecting", { livekitUrl });

  return (
    <LiveKitRoom
      serverUrl={livekitUrl}
      token={token}
      audio={true}
      video={false}
      connect={true}
      onDisconnected={exitVoiceMode}
      style={{ display: "contents" }}
    >
      <RunwayCharacterRoom scrt2Url={scrt2Url} onExit={exitVoiceMode} />
    </LiveKitRoom>
  );
}

interface RunwayAgentProps {
  config: RunwayConfig;
  scrt2Url: string;
}

function RunwayAgent({ config, scrt2Url }: RunwayAgentProps) {
  if (!validateRunwayConfig(config)) return null;
  return <RunwayAgentInner config={config} scrt2Url={scrt2Url} />;
}

export default RunwayAgent;

/* oxlint-disable react-refresh/only-export-components -- barrel re-exports */
export {
  isRunwayEnabled,
  validateRunwayConfig,
  extractSpeakText,
} from "../../utils/runway.utils";
export type { RunwayConfig } from "../../utils/runway.utils";
/* oxlint-enable react-refresh/only-export-components */
