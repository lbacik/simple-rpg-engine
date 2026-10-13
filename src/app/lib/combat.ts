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
import { getDatabase } from '@/persistence/index';
import { parseCombatAction } from './combat-request';
import { getInterfaceLanguage } from './language';
import { ensureSessionId, getSessionHash } from './session';
import { executeTurn } from './turn';

export async function combatAction(formData: FormData): Promise<never> {
  const playthroughId = String(formData.get('playthroughId') ?? '');
  const expectedStep = Number(String(formData.get('expectedStep') ?? ''));
  const actionId = String(formData.get('combat') ?? '');
  if (playthroughId === '' || !Number.isInteger(expectedStep)) {
    notFound();
  }
  const path = `/play/${playthroughId}`;
  // A forged action value fails fast here before reaching the engine, which
  // re-validates real actions independently.
  const action = parseCombatAction({
    actionId,
    // A Combat use-item also names its Consumable; other actions ignore it.
    itemId: actionId === 'use-item' ? String(formData.get('item') ?? '') : undefined,
    // The target travels independently from the item: the engine validates
    // the pair (an unknown or defeated target, or a target on an action that
    // takes none, is illegal). Pre-release forms post no target, which
    // parses to none and means the lone survivor.
    targetParticipantId: String(formData.get('target') ?? ''),
    expectedStep,
  });
  if (action === undefined) {
    // A forged action value fails fast with the unavailable notice; the
    // engine re-validates real actions independently.
    await ensureSessionId();
    revalidatePath(path);
    redirect(`${path}?notice=unavailable`);
  }
  const sessionHash = await getSessionHash();
  // Sliding refresh: re-set the same id with a fresh Max-Age.
  await ensureSessionId();

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
