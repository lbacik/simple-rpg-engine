// Anonymous browser Sessions (docs/spec/architecture.md, session). Created
// lazily on the first write action. The database stores only a hash of the id.

import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

export const SESSION_COOKIE = 'session';
/** 400 days in seconds. */
export const SESSION_MAX_AGE = 400 * 24 * 60 * 60;

export function newSessionId(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionId(id: string): string {
  return createHash('sha256').update(id, 'utf8').digest('hex');
}

export async function getSessionId(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}

export async function getSessionHash(): Promise<string | undefined> {
  const id = await getSessionId();
  return id ? hashSessionId(id) : undefined;
}

export function sessionCookieAttributes(): {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}

/**
 * Return the current Session id, creating one lazily when absent. Creating
 * only happens on write actions; read-only pages use `getSessionHash` and
 * show no Playthroughs without a cookie.
 */
export async function ensureSessionId(): Promise<{ id: string; created: boolean }> {
  const existing = await getSessionId();
  if (existing) {
    const jar = await cookies();
    jar.set(SESSION_COOKIE, existing, sessionCookieAttributes());
    return { id: existing, created: false };
  }
  const id = newSessionId();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, sessionCookieAttributes());
  return { id, created: true };
}
