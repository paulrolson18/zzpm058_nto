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

import { createHmac } from "node:crypto";
import { data } from "react-router";
import type { Route } from "./+types/api.runway-token";
import { getAuth } from "@/middlewares/auth.server";

function base64url(value: object | string): string {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return Buffer.from(str).toString("base64url");
}

function signJwt(
  apiKey: string,
  apiSecret: string,
  grants: Record<string, unknown>,
  ttlSeconds = 3600,
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url({ alg: "HS256", typ: "JWT" });
  const payload = base64url({
    iss: apiKey,
    nbf: now,
    exp: now + ttlSeconds,
    ...grants,
  });
  const unsigned = `${header}.${payload}`;
  const sig = createHmac("sha256", apiSecret).update(unsigned).digest("base64url");
  return `${unsigned}.${sig}`;
}

/**
 * Resource route: issues a LiveKit participant token for the browser to join the Runway room.
 * Uses manual HS256 JWT (node:crypto) — no external SDK needed, same algorithm as livekit-server-sdk.
 * If LIVEKIT_AGENT_NAME is set, dispatches the named agent to this room via the LiveKit Twirp API.
 */
export async function loader({ context }: Route.LoaderArgs) {
  const livekitUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!livekitUrl || !apiKey || !apiSecret) {
    throw data({ error: "LiveKit env vars not configured" }, { status: 500 });
  }

  const auth = getAuth(context);
  const usid = (auth.usid as string | undefined) ?? "anonymous";
  const roomName = `runway-${usid}`;
  const identity = `browser-${usid}`;

  // Participant token — browser joins the room with publish + subscribe
  const token = signJwt(apiKey, apiSecret, {
    sub: identity,
    video: { roomJoin: true, room: roomName, canPublish: true, canSubscribe: true },
  });

  // Dispatch the named agent to this specific room (explicit dispatch mode)
  const agentName = process.env.LIVEKIT_AGENT_NAME;
  if (agentName) {
    try {
      const httpUrl = livekitUrl.replace(/^wss?:\/\//, "https://");
      const adminToken = signJwt(apiKey, apiSecret, {
        video: { roomAdmin: true, room: roomName },
      }, 60);
      const dispatchRes = await fetch(`${httpUrl}/twirp/livekit.AgentDispatchService/CreateDispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ room: roomName, agent_name: agentName }),
      });
      if (!dispatchRes.ok) {
        const body = await dispatchRes.text().catch(() => "(unreadable)");
        console.warn(`[runway-token] Agent dispatch ${dispatchRes.status}: ${body}`);
      } else {
        console.info(`[runway-token] Dispatched agent "${agentName}" to room "${roomName}"`);
      }
    } catch (dispatchError) {
      console.warn("[runway-token] Agent dispatch failed:", dispatchError);
    }
  } else {
    console.warn("[runway-token] LIVEKIT_AGENT_NAME not set — agent dispatch skipped");
  }

  return data(
    { token, livekitUrl, roomName },
    { headers: { "Cache-Control": "no-store" } },
  );
}
