// Arena surrender route (Combat MVP 1.0, P5 A5/A6): a plain POST, so play
// works without JavaScript. Surrender ends a CHOOSE fight as LOSS_SURRENDER;
// a stale expectedStep or a wrong round redirects with `?notice=stale` and
// surrender outside CHOOSE gets `?notice=rejected` with its reason.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { surrender } from '@/engine/combat/index';
import {
  arenaFights,
  arenaRoundGuard,
  arenaSessionHash,
  ensureArenaSession,
  readArenaFightForWrite,
} from '../server';

export async function POST(request: Request): Promise<never> {
  const formData = await request.formData();
  const sessionHash = await arenaSessionHash();
  if (sessionHash === null) redirect('/arena?notice=stale');
  // Sliding refresh: re-set the same id with a fresh Max-Age.
  await ensureArenaSession();
  const fights = arenaFights();

  const fight = await readArenaFightForWrite(sessionHash);
  arenaRoundGuard(formData, fight);
  const expectedStep = fight.step;

  const surrendered = surrender(fight.combat);
  if (!surrendered.ok) {
    redirect(`/arena?notice=rejected&reason=${encodeURIComponent(surrendered.reason)}`);
  }
  const committed = await fights.commit(sessionHash, expectedStep, surrendered.state);
  if (!committed) redirect('/arena?notice=stale');
  revalidatePath('/arena');
  redirect('/arena');
}
