// Playthrough Combat surrender route (Combat MVP 1.0, P6 G1/G3): a plain
// POST, so play works without JavaScript. It runs through executeTurn with a
// `combat-surrender` action: surrender ends the running fight as
// LOSS_SURRENDER and routes to the Encounter's `surrender` Outcome, leaving
// the Encounter undefeated. A stale expectedStep or a wrong round redirects
// with `?notice=stale`; surrender with no fight running gets
// `?notice=rejected` with its reason; neither changes state or `step`.
// Another Session's Playthrough, or a nonexistent one, is a 404.

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { getScenario } from '@/content/registry';
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

  const expectedStep = Number(String(formData.get('expectedStep') ?? ''));
  const round = Number(String(formData.get('round') ?? ''));

  const result = await executeTurn(
    getDatabase(),
    getScenario,
    playthroughId,
    sessionHash,
    { kind: 'combat-surrender', round, expectedStep },
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
