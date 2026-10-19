// Arena server helpers (Combat MVP 1.0, P5): session handling and store
// access shared by the Arena POST routes. Server-only: importing this
// module from a Client Component fails the build.

import 'server-only';

import { redirect } from 'next/navigation';
import {
  ArenaFightStore,
  SessionStore,
  getDatabase,
  type StoredArenaFight,
} from '@/persistence/index';
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

/**
 * Read the Session's fight for a write route (handoff A2/A6): a missing row
 * redirects with `?notice=stale`, an unreadable row redirects plain — the
 * page then shows the "cannot be read" notice with the Setup form. Never
 * returns a bad row.
 */
export async function readArenaFightForWrite(sessionHash: string): Promise<StoredArenaFight> {
  const read = await arenaFights().read(sessionHash);
  if (read.status === 'missing') redirect('/arena?notice=stale');
  if (read.status === 'unreadable') redirect('/arena');
  return read.fight;
}

/**
 * Guard an `expectedStep`/`round` pair (handoff A6): stale unless the posted
 * step still equals the stored one and the posted round equals the fight's
 * round. Callers redirect before writing, so a stale command neither changes
 * state nor `step`.
 */
export function arenaRoundGuard(formData: FormData, fight: StoredArenaFight): number {
  const expectedStep = Number(formField(formData, 'expectedStep') ?? '');
  if (!Number.isInteger(expectedStep) || expectedStep !== fight.step) {
    redirect('/arena?notice=stale');
  }
  const round = Number(formField(formData, 'round') ?? '');
  if (round !== fight.combat.round) redirect('/arena?notice=stale');
  return round;
}
