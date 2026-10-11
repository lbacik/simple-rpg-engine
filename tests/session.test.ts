// Session helpers: id shape, hashing, and cookie attributes.

import { describe, expect, it } from 'vitest';
import {
  SESSION_MAX_AGE,
  hashSessionId,
  newSessionId,
  sessionCookieAttributes,
} from '../src/app/lib/session';

describe('sessions', () => {
  it('mints 256-bit base64url ids and stores only a hash', () => {
    const id = newSessionId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(id, 'base64url')).toHaveLength(32);
    const hash = hashSessionId(id);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(id);
  });

  it('sets the specified cookie attributes', () => {
    expect(sessionCookieAttributes()).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    expect(SESSION_MAX_AGE).toBe(400 * 24 * 60 * 60);
  });
});
