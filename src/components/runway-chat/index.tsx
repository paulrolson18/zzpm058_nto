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

import { lazy, Suspense, useEffect } from 'react';
import { useCurrentSiteAndLocaleRef } from '@/hooks/use-current-site-and-locale-ref';
import { validateRunwayConfig, type RunwayConfig } from '@/utils/runway.utils';
import { ChatFab } from './chat-fab';
import { useRunwayChat } from './use-runway-chat';

const ChatPanel = lazy(() =>
  import('./chat-panel').then((m) => ({ default: m.ChatPanel })),
);

interface RunwayChatWidgetProps {
  config: RunwayConfig;
  scrt2Url: string;
  /** Path to a looping video file for the character preview, e.g. "/videos/bto-agent-video.mp4" */
  characterVideoSrc?: string;
  agentName?: string;
  agentSubtitle?: string;
}

function RunwayChatWidgetInner({
  config,
  scrt2Url,
  characterVideoSrc,
  agentName = 'Shopper',
  agentSubtitle = 'AI Shopper Agent',
}: RunwayChatWidgetProps) {
  const { siteRef, localeRef } = useCurrentSiteAndLocaleRef();
  const tokenEndpoint =
    config.tokenEndpoint ?? `/${siteRef}/${localeRef}/api/runway-token`;

  const {
    isOpen,
    setIsOpen,
    isVoiceMode,
    startVoiceMode,
    stopVoiceMode,
    messages,
    sendMessage,
    addAgentMessage,
    clearMessages,
  } = useRunwayChat({ scrt2Url });

  // Whenever the panel hides, disconnect the LiveKit session and revert to the video preview.
  // This handles the X button, future keyboard/outside-click dismissals, and agent inactivity timeouts.
  useEffect(() => {
    if (!isOpen) stopVoiceMode();
  }, [isOpen, stopVoiceMode]);

  return (
    <>
      {!isOpen && <ChatFab onClick={() => setIsOpen(true)} />}

      {isOpen && (
        <Suspense fallback={null}>
          <ChatPanel
            isOpen={isOpen}
            onClose={() => {
              stopVoiceMode();
              setIsOpen(false);
            }}
            agentName={agentName}
            agentSubtitle={agentSubtitle}
            scrt2Url={scrt2Url}
            tokenEndpoint={tokenEndpoint}
            isVoiceMode={isVoiceMode}
            onStartVoiceMode={startVoiceMode}
            onStopVoiceMode={stopVoiceMode}
            messages={messages}
            onSendMessage={sendMessage}
            onClearChat={clearMessages}
            onAgentMessage={addAgentMessage}
            characterVideoSrc={characterVideoSrc}
          />
        </Suspense>
      )}
    </>
  );
}

export default function RunwayChatWidget(props: RunwayChatWidgetProps) {
  if (!validateRunwayConfig(props.config)) return null;
  return <RunwayChatWidgetInner {...props} />;
}
