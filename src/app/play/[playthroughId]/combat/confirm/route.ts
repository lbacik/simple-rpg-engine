// Playthrough Combat confirm route (Combat MVP 1.0, P6 G1): a plain POST
// carrying the Round command, so play works without JavaScript. It runs
// through executeTurn with a `combat-confirm` action: a stale expectedStep or
// a wrong round redirects with `?notice=stale`; an illegal command gets
// `?notice=rejected` with its reason; neither changes state or `step`. A
// double submit pays nothing twice: the loser of the step race reads stale.
// Another Session's Playthrough, or a nonexistent one, is a 404.

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { getScenario } from '@/content/registry';
import type { ActionId, RoundCommand, Stance } from '@/engine/combat/index';
import { getDatabase } from '@/persistence/index';
import { getInterfaceLanguage } from '@/app/lib/language';
import { ensureSessionId, getSessionHash } from '@/app/lib/session';
import { executeTurn } from '@/app/lib/turn';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ playthroughId: string }> },
): Promise<never> {
  const { playthroughId } = await context.params;
  const formData = await request.formData();
  const sessionHash = await getSessionHash();
  // Sliding refresh: re-set the same id with a fresh Max-Age.
  await ensureSessionId();
  const path = `/play/${playthroughId}`;

  // Guards stay in the engine: a non-numeric step or round never equals the
  // stored one, so it reads back stale; an unknown stance, action or target
  // rejects as illegal. Nothing here writes.
  const expectedStep = Number(String(formData.get('expectedStep') ?? ''));
  const targetRaw = String(formData.get('target') ?? '');
  const command: RoundCommand = {
    round: Number(String(formData.get('round') ?? '')),
    stance: String(formData.get('stance') ?? '') as Stance,
    actionId: String(formData.get('action') ?? '') as ActionId,
    targetId: targetRaw === '' ? null : targetRaw,
  };

  const result = await executeTurn(
    getDatabase(),
    getScenario,
    playthroughId,
    sessionHash,
    { kind: 'combat-confirm', command, expectedStep },
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
  if (result.reason === 'stale') {
    redirect(`${path}?notice=stale`);
  }
  if (result.reason === 'illegal') {
    redirect(`${path}?notice=rejected&reason=${encodeURIComponent(result.detail ?? 'illegal-action')}`);
  }
  redirect(`${path}?notice=unavailable`);
}
