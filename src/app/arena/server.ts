// Arena server helpers (Combat MVP 1.0, P5): session handling and store
// access shared by the Arena POST routes. Server-only: importing this
// module from a Client Component fails the build.

import 'server-only';

import { ArenaFightStore, SessionStore, getDatabase } from '@/persistence/index';
import { ensureSessionId, getSessionHash, hashSessionId } from '../lib/session';

/** Read a string field from posted form data (files never carry commands). */
export function formField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === 'string' ? value : null;
}

/** The string getter the Setup form parser reads a posted form through. */
export function formGetter(formData: FormData): (name: string) => string | null {
  return (name) => formField(formData, name);
}

/**
 * Ensure the browser Session for a write route and touch its row, so the
 * Arena fight always keys off a stored Session. Creating happens only on
 * write actions; read-only renders use `getSessionHash` and show no fight
 * without a cookie.
 */
export async function ensureArenaSession(): Promise<{ hash: string }> {
  const { id } = await ensureSessionId();
  const hash = hashSessionId(id);
  await new SessionStore(getDatabase()).touch(hash);
  return { hash };
}

/** The Arena fight store on the shared database handle. */
export function arenaFights(): ArenaFightStore {
  return new ArenaFightStore(getDatabase());
}

/** The Session hash for a read route, or null without a cookie. */
export async function arenaSessionHash(): Promise<string | null> {
  return (await getSessionHash()) ?? null;
}
