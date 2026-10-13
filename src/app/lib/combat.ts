// The Combat server action: Position, Fight, Items and Leave buttons post
// here as plain forms, so Combat works without JavaScript
// (docs/spec/architecture.md, turn transport).
//
// Every submission re-checks, in order: the Session, ownership of the
// Playthrough, `step`, then legality in the engine (via executeTurn).
// Rejections change nothing and redirect back with a transient notice; there
// is no error page. Another Session's Playthrough, or a nonexistent one, is
// a 404. A forged action value fails fast here before reaching the engine,
// which re-validates real actions independently.

'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { getScenario } from '@/content/registry';
import type { Action, CombatAction } from '@/engine/index';
import { getDatabase } from '@/persistence/index';
import { getInterfaceLanguage } from './language';
import { ensureSessionId, getSessionHash } from './session';
import { executeTurn } from './turn';

const COMBAT_ACTIONS: ReadonlySet<string> = new Set([
  'advance',
  'fall-back',
  'attack',
  'defend',
  'use-item',
  'escape',
]);

function isCombatAction(value: string): value is CombatAction {
  return COMBAT_ACTIONS.has(value);
}

export async function combatAction(formData: FormData): Promise<never> {
  const playthroughId = String(formData.get('playthroughId') ?? '');
  const expectedStep = Number(String(formData.get('expectedStep') ?? ''));
  const actionId = String(formData.get('combat') ?? '');
  if (playthroughId === '' || !Number.isInteger(expectedStep)) {
    notFound();
  }
  const path = `/play/${playthroughId}`;
  if (!isCombatAction(actionId)) {
    // A forged action value fails fast with the unavailable notice; the
    // engine re-validates real actions independently.
    await ensureSessionId();
    revalidatePath(path);
    redirect(`${path}?notice=unavailable`);
  }
  const sessionHash = await getSessionHash();
  // Sliding refresh: re-set the same id with a fresh Max-Age.
  await ensureSessionId();

  // A Combat use-item also names its Consumable; other actions ignore it.
  const itemId = actionId === 'use-item' ? String(formData.get('item') ?? '') : undefined;
  const action: Action = { kind: 'combat', combatAction: actionId, itemId, expectedStep };
  const result = await executeTurn(
    getDatabase(),
    getScenario,
    playthroughId,
    sessionHash,
    action,
    randomInt,
    await getInterfaceLanguage(),
  );
  if (result.ok) {
    revalidatePath(path);
    redirect(path);
  }
  if (result.reason === 'not-found') {
    notFound();
  }
  revalidatePath(path);
  redirect(
    result.reason === 'stale' ? `${path}?notice=stale` : `${path}?notice=unavailable`,
  );
}
