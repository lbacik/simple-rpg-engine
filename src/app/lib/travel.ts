// The Travel server action: exit buttons post here as plain forms, so play
// works without JavaScript (docs/spec/architecture.md, turn transport).
//
// Every submission re-checks, in order: the Session, ownership of the
// Playthrough, `step`, then legality in the engine (via executeTurn). The
// Session cookie's Max-Age slides on every action. Rejections change nothing
// and redirect back with a transient notice; there is no error page. Another
// Session's Playthrough, or a nonexistent one, is a 404.

'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { getScenario } from '@/content/registry';
import { getDatabase } from '@/persistence/index';
import { ensureSessionId, getSessionHash } from './session';
import { executeTurn } from './turn';

export async function travelAction(formData: FormData): Promise<never> {
  const playthroughId = String(formData.get('playthroughId') ?? '');
  const target = String(formData.get('target') ?? '');
  const expectedStep = Number(String(formData.get('expectedStep') ?? ''));
  const sessionHash = await getSessionHash();
  // Sliding refresh: re-set the same id with a fresh Max-Age.
  await ensureSessionId();

  const result = await executeTurn(
    getDatabase(),
    getScenario,
    playthroughId,
    sessionHash,
    { kind: 'travel', targetLocationId: target, expectedStep },
    randomInt,
  );
  const path = `/play/${playthroughId}`;
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
