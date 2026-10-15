// The Arena server actions: the Bestiary Start and the Combat buttons post
// here as plain forms, so the Arena works without JavaScript
// (docs/spec/architecture.md, turn transport).
//
// Every submission re-checks, in order: the Session, the stored run, `step`,
// then legality in the engine (via applyArenaAction). Rejections change
// nothing and redirect back with a transient notice; there is no error page.
// Starting a fight replaces the Session's run and remembers its setup; going
// back to the setup clears the run but keeps the remembered setup, and Fight
// again restarts it fresh. A forged action value fails fast here before reaching
// the engine, which
// re-validates real actions independently — including a forged Consumable id,
// which the engine rejects through the normal path (no dice, no step).
//
// The Combat `use-item` posts its Consumable id as `item`, like the Scenario
// Combat form; every other action posts no `item`.

'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { applyArenaAction, startArena } from '@/engine/index';
import { isCombatAction } from '@/app/lib/combat-request';
import { getInterfaceLanguage } from '@/app/lib/language';
import { ensureSessionId, getSessionHash, hashSessionId } from '@/app/lib/session';
import { ArenaSetupStore, ArenaStore, getDatabase } from '@/persistence/index';
import {
  arenaSetupFromRemembered,
  captureRememberedSetup,
  parseRememberedSetup,
  validatedSetupFromForm,
} from './last-setup';

const PATH = '/arena';

function unavailable(): never {
  revalidatePath(PATH);
  redirect(`${PATH}?notice=unavailable`);
}

export async function startArenaAction(formData: FormData): Promise<never> {
  const language = await getInterfaceLanguage();
  // The form offers two opponent slots, each with its own starting Range, the
  // five Character controls and the four Equipment controls. The shared
  // pipeline parses and engine-validates them all, so the fight never starts
  // on forged values.
  const setup = validatedSetupFromForm(formData, language);
  if (setup === undefined) {
    await ensureSessionId();
    unavailable();
  }
  // Created lazily, like the first Playthrough write: read-only visits set no
  // cookie and store no run.
  const { id } = await ensureSessionId();
  const sessionHash = hashSessionId(id);
  // Remember the setup for this Session: reopening the Arena restores it and
  // Fight again restarts it. The snapshot is captured from the same validated
  // form, so remembering cannot diverge from the fight.
  const snapshot = captureRememberedSetup(formData);
  if (snapshot !== undefined) {
    await new ArenaSetupStore(getDatabase()).save(sessionHash, JSON.stringify(snapshot));
  }
  const started = startArena(setup, randomInt);
  await new ArenaStore(getDatabase()).replace(sessionHash, started.state, started.journal);
  revalidatePath(PATH);
  redirect(PATH);
}

/**
 * Fight again with the remembered setup (issue #171): a new Combat with the
 * identical setup and fresh Health, Range and Intents, through the same
 * pipeline as Start. The remembered setup survives; a missing or stale one
 * lands back on the page it came from.
 */
export async function rematchArenaAction(): Promise<never> {
  const language = await getInterfaceLanguage();
  const sessionHash = await getSessionHash();
  // Sliding refresh: re-set the same id with a fresh Max-Age.
  await ensureSessionId();
  if (sessionHash === undefined) {
    revalidatePath(PATH);
    redirect(PATH);
  }
  const raw = await new ArenaSetupStore(getDatabase()).findRaw(sessionHash);
  const snapshot = raw === null ? undefined : parseRememberedSetup(raw);
  const setup =
    snapshot === undefined ? undefined : arenaSetupFromRemembered(snapshot, language);
  if (setup === undefined) {
    revalidatePath(PATH);
    redirect(PATH);
  }
  const started = startArena(setup, randomInt);
  await new ArenaStore(getDatabase()).replace(sessionHash, started.state, started.journal);
  revalidatePath(PATH);
  redirect(PATH);
}

export async function arenaCombatAction(formData: FormData): Promise<never> {
  const expectedStep = Number(String(formData.get('expectedStep') ?? ''));
  const actionId = String(formData.get('combat') ?? '');
  // Only the whitelist fails fast: real actions (including a `use-item` with
  // a forged Consumable id) reach the engine's normal-path rejection.
  if (!Number.isInteger(expectedStep) || !isCombatAction(actionId)) {
    await ensureSessionId();
    unavailable();
  }
  const sessionHash = await getSessionHash();
  // Sliding refresh: re-set the same id with a fresh Max-Age.
  await ensureSessionId();
  if (sessionHash === undefined) {
    revalidatePath(PATH);
    redirect(PATH);
  }
  const store = new ArenaStore(getDatabase());
  const run = await store.findBySession(sessionHash);
  if (run === null) {
    revalidatePath(PATH);
    redirect(PATH);
  }
  const target = String(formData.get('target') ?? '');
  const item = String(formData.get('item') ?? '');
  const result = applyArenaAction(
    run.state,
    {
      action: actionId,
      ...(target === '' ? {} : { targetId: target }),
      ...(item === '' ? {} : { itemId: item }),
      expectedStep,
    },
    randomInt,
  );
  if (!result.ok) {
    revalidatePath(PATH);
    // The fight already ended: the result screen is now showing, so no notice.
    redirect(
      result.reason === 'stale-step'
        ? `${PATH}?notice=stale`
        : result.reason === 'illegal-action'
          ? `${PATH}?notice=unavailable`
          : PATH,
    );
  }
  const committed = await store.commit(sessionHash, expectedStep, result.state, result.journal);
  revalidatePath(PATH);
  redirect(committed ? PATH : `${PATH}?notice=stale`);
}

export async function resetArenaAction(): Promise<never> {
  const sessionHash = await getSessionHash();
  await ensureSessionId();
  if (sessionHash !== undefined) {
    await new ArenaStore(getDatabase()).clear(sessionHash);
  }
  revalidatePath(PATH);
  redirect(PATH);
}
