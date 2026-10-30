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

/** Result of the MIAW unauthenticated access-token call. */
export interface MiawTokenResult {
    accessToken: string;
    /** Unix ms timestamp when the token expires (decoded from JWT exp claim). */
    expiresAt: number;
}

/** A text message to send to a MIAW conversation. */
export interface MiawOutboundMessage {
    /** UUID v4 — reused by the client for optimistic-UI deduplication. */
    id: string;
    text: string;
    /** Must be true on the first message of a new conversation to start routing. */
    isNewMessagingSession: boolean;
    routingAttributes?: Record<string, unknown>;
    language?: string;
}

/** Decode the `exp` claim from a JWT (no signature verification needed — we just issued it). */
function jwtExpiresAt(jwt: string): number {
    try {
        const payloadB64 = jwt.split('.')[1];
        if (!payloadB64) return 0;
        const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
        const { exp } = JSON.parse(json) as { exp?: number };
        return exp ? exp * 1000 : 0;
    } catch {
        return 0;
    }
}

/**
 * Obtain an unauthenticated MIAW access token from SCRT2.
 * No server secret required — this is a public endpoint.
 */
export async function getMiawAccessToken(
    scrt2Url: string,
    orgId: string,
    esDeveloperName: string
): Promise<MiawTokenResult> {
    const url = `${scrt2Url}/iamessage/api/v2/authorization/unauthenticated/access-token`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            orgId,
            esDeveloperName,
            capabilitiesVersion: '65',
            platform: 'Web',
        }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`MIAW auth failed ${res.status}: ${body}`);
    }

    const json = (await res.json()) as { accessToken?: string };
    const accessToken = json.accessToken;
    if (!accessToken) throw new Error('MIAW auth response missing accessToken');

    return { accessToken, expiresAt: jwtExpiresAt(accessToken) };
}

/**
 * Create a new MIAW conversation.
 * The `conversationId` must be a UUID v4 unique to this user — reusing IDs
 * across users risks data leakage.
 */
export async function createMiawConversation(
    scrt2Url: string,
    accessToken: string,
    conversationId: string,
    esDeveloperName: string
): Promise<void> {
    const url = `${scrt2Url}/iamessage/api/v2/conversation`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ conversationId, esDeveloperName }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
            `MIAW createConversation failed ${res.status}: ${body} | scrt2Url=${scrt2Url} esDeveloperName=${esDeveloperName}`
        );
    }
}

/**
 * Send a text message to an existing MIAW conversation.
 */
export async function sendMiawMessage(
    scrt2Url: string,
    accessToken: string,
    conversationId: string,
    esDeveloperName: string,
    message: MiawOutboundMessage
): Promise<void> {
    const url = `${scrt2Url}/iamessage/api/v2/conversation/${conversationId}/message`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            message: {
                id: message.id,
                messageType: 'StaticContentMessage',
                staticContent: { formatType: 'Text', text: message.text },
            },
            esDeveloperName,
            isNewMessagingSession: message.isNewMessagingSession,
            ...(message.routingAttributes ? { routingAttributes: message.routingAttributes } : {}),
            ...(message.language ? { language: message.language } : {}),
        }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`MIAW sendMessage failed ${res.status}: ${body}`);
    }
}

/**
 * Close a MIAW conversation.
 * After closing, no more messages can be sent; the user must start a new session.
 */
export async function closeMiawConversation(
    scrt2Url: string,
    accessToken: string,
    conversationId: string
): Promise<void> {
    const url = `${scrt2Url}/iamessage/api/v2/conversation/${conversationId}`;
    const res = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`MIAW closeConversation failed ${res.status}: ${body}`);
    }
}
