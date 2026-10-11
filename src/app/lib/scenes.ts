// The Scene server actions: Choice buttons, the implicit Continue and
// on-demand Scene buttons post here as plain forms, so play works without
// JavaScript (docs/spec/architecture.md, turn transport).
//
// Every submission re-checks, in order: the Session, ownership of the
// Playthrough, `step`, then legality in the engine (via executeTurn).
// Rejections change nothing and redirect back with a transient notice; there
// is no error page. Another Session's Playthrough, or a nonexistent one, is
// a 404.

'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { getScenario } from '@/content/registry';
import type { Action } from '@/engine/index';
import { getDatabase } from '@/persistence/index';
import { ensureSessionId, getSessionHash } from './session';
import { executeTurn } from './turn';

async function runSceneAction(playthroughId: string, expectedStep: number, action: Action): Promise<never> {
  const sessionHash = await getSessionHash();
  // Sliding refresh: re-set the same id with a fresh Max-Age.
  await ensureSessionId();

  const result = await executeTurn(
    getDatabase(),
    (scenarioId) => getScenario(scenarioId),
    playthroughId,
    sessionHash,
    action,
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

export async function chooseAction(formData: FormData): Promise<never> {
  const playthroughId = String(formData.get('playthroughId') ?? '');
  const choiceId = String(formData.get('choice') ?? '');
  const expectedStep = Number(String(formData.get('expectedStep') ?? ''));
  return runSceneAction(playthroughId, expectedStep, {
    kind: 'choose',
    choiceId,
    expectedStep,
  });
}

export async function continueAction(formData: FormData): Promise<never> {
  const playthroughId = String(formData.get('playthroughId') ?? '');
  const expectedStep = Number(String(formData.get('expectedStep') ?? ''));
  return runSceneAction(playthroughId, expectedStep, { kind: 'continue', expectedStep });
}

export async function openSceneAction(formData: FormData): Promise<never> {
  const playthroughId = String(formData.get('playthroughId') ?? '');
  const sceneId = String(formData.get('scene') ?? '');
  const expectedStep = Number(String(formData.get('expectedStep') ?? ''));
  return runSceneAction(playthroughId, expectedStep, {
    kind: 'open-scene',
    sceneId,
    expectedStep,
  });
}
