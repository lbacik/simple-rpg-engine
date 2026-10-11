// The start action: creates the Playthrough and, if needed, the Session.
// Validation runs before anything is created: an empty or over-long name or
// an unknown Template rejects without creating a Playthrough or a Session.

'use server';

import { randomInt, randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { getScenario } from '@/content/registry';
import { startPlaythrough } from '@/engine/index';
import { getDatabase, PlaythroughStore, SessionStore } from '@/persistence/index';
import { ensureSessionId, hashSessionId } from './session';

export type StartState = { error?: string };

export async function startPlaythroughAction(
  scenarioId: string,
  _prev: StartState,
  formData: FormData,
): Promise<StartState> {
  const scenario = getScenario(scenarioId);
  if (!scenario) return { error: 'That Scenario is no longer available.' };
  const templateId = String(formData.get('templateId') ?? '');
  const name = String(formData.get('name') ?? '');

  const engineResult = startPlaythrough(scenario, templateId, name, randomInt);
  if (!engineResult.ok) {
    if (engineResult.reason === 'invalid-name') {
      return { error: 'Enter a name of 1–40 characters.' };
    }
    return { error: 'Choose one of the Character Templates.' };
  }

  const { id: sessionId } = await ensureSessionId();
  const sessionHash = hashSessionId(sessionId);
  const db = getDatabase();
  await new SessionStore(db).touch(sessionHash);
  const playthroughId = randomUUID();
  await new PlaythroughStore(db).create(
    {
      id: playthroughId,
      sessionId: sessionHash,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      contentHash: scenario.contentHash,
      status: engineResult.state.status,
      endingId: engineResult.state.endingId ?? null,
      step: engineResult.state.step,
      state: engineResult.state,
    },
    engineResult.journal.map((entry) => ({
      step: engineResult.state.step,
      type: entry.type,
      payload: { text: entry.text },
    })),
  );
  redirect(`/play/${playthroughId}`);
}
