// Arena confirm route (Combat MVP 1.0, P5 A6): a plain POST carrying the
// Round command, so play works without JavaScript. A stale expectedStep or
// a wrong round redirects with `?notice=stale`; an illegal command gets
// `?notice=rejected` with its reason; neither changes state or step. A
// double submit pays nothing twice: the loser of the step race reads stale.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { submitRound } from '@/engine/combat/index';
import type { ActionId, RoundCommand, Stance } from '@/engine/combat/index';
import { arenaFights, arenaSessionHash, ensureArenaSession, formField } from '../server';

function rejected(reason: string, params?: Record<string, string | number>): never {
  const query = new URLSearchParams({ notice: 'rejected', reason });
  for (const [key, value] of Object.entries(params ?? {})) query.set(key, String(value));
  redirect(`/arena?${query.toString()}`);
}

export async function POST(request: Request): Promise<never> {
  const formData = await request.formData();
  const sessionHash = await arenaSessionHash();
  if (sessionHash === null) redirect('/arena?notice=stale');
  // Sliding refresh: re-set the same id with a fresh Max-Age.
  await ensureArenaSession();
  const fights = arenaFights();

  const read = await fights.read(sessionHash);
  if (read.status === 'missing') redirect('/arena?notice=stale');
  if (read.status === 'unreadable') redirect('/arena');
  const { fight } = read;

  const expectedStep = Number(formField(formData, 'expectedStep') ?? '');
  if (!Number.isInteger(expectedStep) || expectedStep !== fight.step) {
    redirect('/arena?notice=stale');
  }
  const round = Number(formField(formData, 'round') ?? '');
  if (round !== fight.combat.round) redirect('/arena?notice=stale');

  const targetRaw = formField(formData, 'target');
  const command: RoundCommand = {
    round,
    stance: (formField(formData, 'stance') ?? '') as Stance,
    actionId: (formField(formData, 'action') ?? '') as ActionId,
    targetId: targetRaw === null || targetRaw === '' ? null : targetRaw,
  };
  const submitted = submitRound(fight.combat, command);
  if (!submitted.ok) rejected(submitted.reason, submitted.params);

  const committed = await fights.commit(sessionHash, expectedStep, submitted.state);
  if (!committed) redirect('/arena?notice=stale');
  revalidatePath('/arena');
  redirect('/arena');
}
