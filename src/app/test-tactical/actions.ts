// Test-only tactical entry path for the browser E2E (tactical-combat
// handoff, U4/U5). Both actions build real saves through the engine and the
// stores — never a mocked panel — and redirect at a real two-participant
// Combat (or a genuine legacy v1 Combat save):
//
// - `newPairCombat`: starts the Hunter in `tactical-pairs`, opens the
//   on-demand ambush Scene and confronts it, landing in round 1 of the
//   wolf-a/wolf-b Encounter;
// - `loadLegacyCombat`: inserts the captured v1 active-Combat save
//   (`tests/fixtures/state-v1/active-combat-near.json`) with its Journal
//   verbatim, so the browser exercises migration writeback on read.
//
// Plain forms, so the E2E drives them with JavaScript disabled. Unreachable
// in production: the page answers 404 unless E2E_TEST_ROUTES=1, which the
// Playwright webServer sets only for its throwaway database server, and each
// action re-checks before writing anything.

'use server';

import fs from 'node:fs';
import { randomInt, randomUUID } from 'node:crypto';
import path from 'node:path';
import { redirect } from 'next/navigation';
import { getScenario } from '@/content/registry';
import { localizeScenario } from '@/content/index';
import { applyAction, startPlaythrough } from '@/engine/index';
import type { PlaythroughState } from '@/engine/state';
import { getDatabase, PlaythroughStore, SessionStore } from '@/persistence/index';
import { getInterfaceLanguage } from '../lib/language';
import { ensureSessionId, hashSessionId } from '../lib/session';

function testRoutesAllowed(): boolean {
  return process.env.E2E_TEST_ROUTES === '1';
}

export async function newPairCombat(): Promise<never> {
  if (!testRoutesAllowed()) redirect('/test-tactical?error=forbidden');
  const scenario = getScenario('tactical-pairs');
  if (!scenario) redirect('/test-tactical?error=no-scenario');
  const interfaceLanguage = await getInterfaceLanguage();
  const localized = localizeScenario(scenario, interfaceLanguage).scenario;
  const started = startPlaythrough(localized, 'hunter', 'E2E', randomInt);
  if (!started.ok) redirect('/test-tactical?error=start');
  let state = started.state;
  // Each transition's entries are stored under the step that transition
  // produced, like the turn pipeline stores them: collapsing everything
  // under the final step would surface older entries in the result panel.
  const stored: { step: number; type: string; lang: string; payload: unknown }[] =
    started.journal.map((entry) => {
      const { type, lang, ...payload } = entry;
      return { step: state.step, type, lang, payload };
    });
  const setup: { kind: 'open-scene'; sceneId: string } | { kind: 'choose'; choiceId: string } =
    { kind: 'open-scene', sceneId: 'ambush' };
  const first = applyAction(localized, state, { ...setup, expectedStep: state.step }, randomInt);
  if (!first.ok) redirect('/test-tactical?error=enter');
  state = first.state;
  for (const entry of first.journal) {
    const { type, lang, ...payload } = entry;
    stored.push({ step: state.step, type, lang, payload });
  }
  const second = applyAction(
    localized,
    state,
    { kind: 'choose', choiceId: 'confront', expectedStep: state.step },
    randomInt,
  );
  if (!second.ok) redirect('/test-tactical?error=enter');
  state = second.state;
  for (const entry of second.journal) {
    const { type, lang, ...payload } = entry;
    stored.push({ step: state.step, type, lang, payload });
  }
  if (state.activeCombat == null) redirect('/test-tactical?error=no-combat');

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
      status: state.status,
      endingId: state.endingId ?? null,
      step: state.step,
      state,
    },
    stored,
  );
  redirect(`/play/${playthroughId}`);
}

type LegacyFixture = {
  meta: { scenarioId: string; scenarioVersion: string; contentHash: string };
  state: { status: string; step: number; endingId?: string | null };
  journal: { step: number; type: string; lang: string; payload: unknown }[];
};

export async function loadLegacyCombat(): Promise<never> {
  if (!testRoutesAllowed()) redirect('/test-tactical?error=forbidden');
  let fixture: LegacyFixture;
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), 'tests', 'fixtures', 'state-v1', 'active-combat-near.json'),
      'utf8',
    );
    fixture = JSON.parse(raw) as LegacyFixture;
  } catch {
    redirect('/test-tactical?error=no-fixture');
  }
  // The v1 bytes are stored verbatim: migration runs on read through the
  // usual Scenario-aware layer, exactly like a pre-release save.
  if (fixture.meta.scenarioId !== 'whispering-woods') {
    redirect('/test-tactical?error=no-fixture');
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
      scenarioId: fixture.meta.scenarioId,
      scenarioVersion: fixture.meta.scenarioVersion,
      contentHash: fixture.meta.contentHash,
      status: fixture.state.status,
      endingId: fixture.state.endingId ?? null,
      step: fixture.state.step,
      state: fixture.state as unknown as PlaythroughState,
    },
    fixture.journal.map((entry) => ({
      step: entry.step,
      type: entry.type,
      lang: entry.lang,
      payload: entry.payload,
    })),
  );
  redirect(`/play/${playthroughId}`);
}
