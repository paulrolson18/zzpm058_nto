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

import type { RouterContextProvider } from 'react-router';
import { createCookie } from '@/lib/cookie-utils.server';

/** Data persisted in the MIAW session cookie. */
export interface MiawSessionData {
    conversationId: string;
    accessToken: string;
    /** Unix ms timestamp when the access token expires. */
    expiresAt: number;
    /** True after the first message has been sent; gates `isNewMessagingSession`. */
    messageSent: boolean;
}

const COOKIE_NAME = 'miaw-session';
/** 5-minute buffer: refresh the token before it hard-expires. */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/**
 * Parse the MIAW session cookie from a request's Cookie header.
 * Returns null when the cookie is absent or malformed.
 */
export async function getMiawSession(
    request: Request,
    context: Readonly<RouterContextProvider>
): Promise<MiawSessionData | null> {
    const cookie = createCookie<string>(COOKIE_NAME, { httpOnly: true, sameSite: 'strict' }, context);
    const raw = await cookie.parse(request.headers.get('Cookie'));
    if (!raw) return null;
    try {
        return JSON.parse(raw) as MiawSessionData;
    } catch {
        return null;
    }
}

/**
 * Serialize a MIAW session into a Set-Cookie header value.
 * Pass `null` to produce a clearing cookie (maxAge: 0).
 */
export async function serializeMiawSession(
    session: MiawSessionData | null,
    context: Readonly<RouterContextProvider>
): Promise<string> {
    const cookie = createCookie<string>(COOKIE_NAME, { httpOnly: true, sameSite: 'strict' }, context);
    if (session === null) {
        return cookie.serialize('', { maxAge: 0 });
    }
    return cookie.serialize(JSON.stringify(session), { maxAge: 86400 });
}

/** True when the session token is still valid (at least EXPIRY_BUFFER_MS left). */
export function isMiawSessionValid(session: MiawSessionData): boolean {
    return session.expiresAt > Date.now() + EXPIRY_BUFFER_MS;
}
