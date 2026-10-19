// Arena restart route (Combat MVP 1.0, P5 A4): a plain POST restarting a
// Setup-started mid-fight from its opening state, behind the in-page
// confirmation (`confirm=1`). The replacement allocates a fresh step above
// every step the Session has used, so a tab from the replaced fight never
// matches. Setup-started runs only for now: `PLAN`-import restarts belong to
// the import package (A3, #241), which stores the opening `initial` they
// return to.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseCombatState, startCombat } from '@/engine/combat/index';
import {
  arenaFights,
  arenaSessionHash,
  ensureArenaSession,
  formField,
  readArenaFightForWrite,
} from '../server';

export async function POST(request: Request): Promise<never> {
  const formData = await request.formData();
  const sessionHash = await arenaSessionHash();
  if (sessionHash === null) redirect('/arena?notice=stale');
  // Sliding refresh: re-set the same id with a fresh Max-Age.
  await ensureArenaSession();
  const fights = arenaFights();

  const fight = await readArenaFightForWrite(sessionHash);
  const initial = parseCombatState(fight.initial);
  if (fight.origin !== 'setup' || fight.combat.phase !== 'CHOOSE' || !initial.ok) {
    redirect('/arena');
  }
  if (formField(formData, 'confirm') !== '1') redirect('/arena?confirm=restart');

  const expectedStep = Number(formField(formData, 'expectedStep') ?? '');
  if (!Number.isInteger(expectedStep) || expectedStep !== fight.step) {
    redirect('/arena?notice=stale');
  }
  const restarted = startCombat(initial.state);
  if (!restarted.ok) {
    redirect(`/arena?notice=rejected&reason=${encodeURIComponent(restarted.reason)}`);
  }
  await fights.start(sessionHash, {
    origin: 'setup',
    setup: fight.setup,
    initial: fight.initial,
    combat: restarted.state,
  });
  revalidatePath('/arena');
  redirect('/arena');
}
