// The start action: creates the Playthrough and, if needed, the Session.
// Validation runs before anything is created: an empty or over-long name or
// an unknown Template rejects without creating a Playthrough or a Session.
// Rejections return errors rendered in the language current when they are
// shown (docs/spec/architecture.md, interface text): the catalogue of the
// request's Interface Language.

'use server';

import { randomInt, randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { getScenario } from '@/content/registry';
import { localizeScenario } from '@/content/index';
import { startPlaythroughV3 } from '@/engine/scenario-play';
import { getCatalogue } from '@/i18n/index';
import { getDatabase, PlaythroughStore, SessionStore } from '@/persistence/index';
import { getInterfaceLanguage } from './language';
import { ensureSessionId, hashSessionId } from './session';

export type StartState = { error?: string };

export async function startPlaythroughAction(
  scenarioId: string,
  _prev: StartState,
  formData: FormData,
): Promise<StartState> {
  const scenario = getScenario(scenarioId);
  const interfaceLanguage = await getInterfaceLanguage();
  const catalogue = getCatalogue(interfaceLanguage);
  if (!scenario) return { error: catalogue.startForm.unknownScenario };
  const templateId = String(formData.get('templateId') ?? '');
  const name = String(formData.get('name') ?? '');

  // New Playthroughs start on the Combat MVP 1.0 v3 journey (P6): the
  // Playthrough starts in the text the Interface Language selects, so the
  // intro Journal entry records the shown language. Ids and hashes are
  // identical either way, so the stored pin stays on the base Scenario.
  const localized = localizeScenario(scenario, interfaceLanguage).scenario;
  const engineResult = startPlaythroughV3(localized, templateId, name, randomInt);
  if (!engineResult.ok) {
    if (engineResult.reason === 'invalid-name') {
      return { error: catalogue.startForm.invalidName() };
    }
    return { error: catalogue.startForm.unknownTemplate };
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
    engineResult.journal.map((entry) => {
      const { type, lang, ...payload } = entry;
      return { step: engineResult.state.step, type, lang, payload };
    }),
  );
  redirect(`/play/${playthroughId}`);
}
