// The Arena Server Actions: starting a fight and resolving Combat rounds.
//
// `startArenaFight` validates the picked Bestiary enemy, starts a Playthrough
// of the Arena Scenario with the default fighter, takes the call scene's
// fight choice straight into Combat and redirects at the fight — the same
// turn pipeline the game screen uses (`executeTurn`), so Combat resolves,
// persists and reloads exactly like there. `arenaCombatAction` is the Combat
// panel's form target on the Arena page: every submission re-checks, in
// order, the Session, ownership of the fight, the Arena Scenario, `step`,
// then legality in the engine. Rejections change nothing and redirect back
// with a transient notice; there is no error page. Another Session's fight,
// or a nonexistent one, is a 404, and so is a non-Arena Playthrough posted
// here. A forged action value fails fast before reaching the engine, which
// re-validates real actions independently.
//
// Every submission posts as a plain form, so the Arena works without
// JavaScript.

'use server';

import { randomInt, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { getScenario } from '@/content/registry';
import { localizeScenario } from '@/content/index';
import { applyAction, startPlaythrough } from '@/engine/index';
import { getCatalogue } from '@/i18n/index';
import {
  ARENA_CHARACTER_NAME,
  ARENA_SCENARIO_ID,
  ARENA_TEMPLATE_ID,
  arenaFightHref,
  parseArenaEnemy,
} from '@/app/lib/arena';
import { parseCombatAction } from '@/app/lib/combat-request';
import { getInterfaceLanguage } from '@/app/lib/language';
import { ensureSessionId, getSessionHash, hashSessionId } from '@/app/lib/session';
import { resolvePlaythrough } from '@/app/lib/playthrough';
import { executeTurn } from '@/app/lib/turn';
import { getDatabase, PlaythroughStore, SessionStore } from '@/persistence/index';

export type ArenaStartState = { error?: string };

export async function startArenaFight(
  _prev: ArenaStartState,
  formData: FormData,
): Promise<ArenaStartState> {
  const scenario = getScenario(ARENA_SCENARIO_ID);
  const interfaceLanguage = await getInterfaceLanguage();
  const catalogue = getCatalogue(interfaceLanguage);
  if (!scenario) return { error: catalogue.startForm.unknownScenario };
  const pick = parseArenaEnemy(String(formData.get('enemy') ?? ''), scenario);
  if (!pick) return { error: catalogue.arena.unknownEnemy };

  // The fight starts in the text the Interface Language selects, so the
  // Journal records the shown language. Ids and hashes are identical either
  // way, so the stored pin stays on the base Scenario.
  const localized = localizeScenario(scenario, interfaceLanguage).scenario;
  const started = startPlaythrough(localized, ARENA_TEMPLATE_ID, ARENA_CHARACTER_NAME, randomInt);
  if (!started.ok) return { error: catalogue.arena.unknownEnemy };
  // Starting activates the call scene; its fight choice moves straight into
  // the picked enemy's Combat, like the test-only tactical entry path does.
  const chosen = applyAction(
    localized,
    started.state,
    { kind: 'choose', choiceId: pick.choiceId, expectedStep: started.state.step },
    randomInt,
  );
  if (!chosen.ok || chosen.state.activeCombat == null) {
    return { error: catalogue.arena.unknownEnemy };
  }

  // Each transition's entries are stored under the step that transition
  // produced, like the turn pipeline stores them: collapsing everything
  // under the final step would surface older entries in the result screen.
  const stored: { step: number; type: string; lang: string; payload: unknown }[] =
    started.journal.map((entry) => {
      const { type, lang, ...payload } = entry;
      return { step: started.state.step, type, lang, payload };
    });
  for (const entry of chosen.journal) {
    const { type, lang, ...payload } = entry;
    stored.push({ step: chosen.state.step, type, lang, payload });
  }

  const { id: sessionId } = await ensureSessionId();
  const sessionHash = hashSessionId(sessionId);
  const db = getDatabase();
  await new SessionStore(db).touch(sessionHash);
  const fightId = randomUUID();
  await new PlaythroughStore(db).create(
    {
      id: fightId,
      sessionId: sessionHash,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      contentHash: scenario.contentHash,
      status: chosen.state.status,
      endingId: chosen.state.endingId ?? null,
      step: chosen.state.step,
      state: chosen.state,
    },
    stored,
  );
  redirect(arenaFightHref(fightId));
}

export async function arenaCombatAction(formData: FormData): Promise<never> {
  const fightId = String(formData.get('playthroughId') ?? '');
  const expectedStep = Number(String(formData.get('expectedStep') ?? ''));
  const actionId = String(formData.get('combat') ?? '');
  if (fightId === '' || !Number.isInteger(expectedStep)) {
    notFound();
  }
  const path = arenaFightHref(fightId);
  // A forged action value fails fast here before reaching the engine, which
  // re-validates real actions independently.
  const action = parseCombatAction({
    actionId,
    // A Combat use-item also names its Consumable; other actions ignore it.
    itemId: actionId === 'use-item' ? String(formData.get('item') ?? '') : undefined,
    // The target travels independently from the item: the engine validates
    // the pair (an unknown or defeated target, or a target on an action that
    // takes none, is illegal).
    targetParticipantId: String(formData.get('target') ?? ''),
    expectedStep,
  });
  if (action === undefined) {
    // A forged action value fails fast with the unavailable notice; the
    // engine re-validates real actions independently.
    await ensureSessionId();
    revalidatePath(path);
    redirect(arenaFightHref(fightId, { notice: 'unavailable' }));
  }
  // This action serves Arena fights only, through the Scenario-aware read
  // layer (never raw store reads): another Session's fight, a nonexistent
  // one, an incompatible one, or a Playthrough of any other Scenario posted
  // here is a 404.
  const db = getDatabase();
  const sessionHash = await getSessionHash();
  const resolved = await resolvePlaythrough(db, getScenario, fightId, sessionHash);
  if (
    resolved === null ||
    !resolved.compatible ||
    resolved.scenario.id !== ARENA_SCENARIO_ID
  ) {
    notFound();
  }
  // Sliding refresh: re-set the same id with a fresh Max-Age.
  await ensureSessionId();

  const result = await executeTurn(
    db,
    getScenario,
    fightId,
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
    arenaFightHref(
      fightId,
      result.reason === 'stale' ? { notice: 'stale' } : { notice: 'unavailable' },
    ),
  );
}
