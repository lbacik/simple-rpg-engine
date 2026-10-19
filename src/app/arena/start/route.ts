// Arena start route (Combat MVP 1.0, P5 A1/A2/A4): a plain POST, so the
// Setup works without JavaScript. It starts a fresh fight from a preset,
// the remembered Setup (Fight again) or the posted Setup fields, then
// redirects back to the Arena. Replacing a CHOOSE fight needs the in-page
// confirmation (`confirm=1`); without it nothing is replaced and the page
// renders the replace confirmation instead.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  ARENA_PRESETS,
  buildArenaInitial,
  parseArenaSetup,
  startCombat,
  type ArenaSetupResult,
} from '@/engine/combat/index';
import { parseSetupFormData } from '../setup-form-data';
import { arenaFights, ensureArenaSession, formField, formGetter } from '../server';

export async function POST(request: Request): Promise<never> {
  const formData = await request.formData();
  const { hash } = await ensureArenaSession();
  const fights = arenaFights();

  const presetRaw = formField(formData, 'preset');
  const fightAgain = formField(formData, 'fightAgain') === '1';
  let setup: ArenaSetupResult;
  if (presetRaw !== null) {
    const preset = (Object.keys(ARENA_PRESETS) as (keyof typeof ARENA_PRESETS)[]).find(
      (id) => id === presetRaw,
    );
    setup =
      preset === undefined
        ? { ok: false, issues: [{ code: 'bad_setup' }] }
        : { ok: true, setup: structuredClone(ARENA_PRESETS[preset]) };
  } else if (fightAgain) {
    const remembered = await fights.readSetup(hash);
    const parsed = parseArenaSetup(remembered);
    setup = !parsed.ok ? { ok: false, issues: [{ code: 'bad_setup' }] } : parsed;
  } else {
    setup = parseSetupFormData(formGetter(formData));
  }
  if (!setup.ok) {
    const reason = setup.issues[0]?.code ?? 'bad_setup';
    redirect(`/arena?notice=rejected&reason=${encodeURIComponent(reason)}`);
  }

  const current = await fights.read(hash);
  if (
    current.status === 'ready' &&
    current.fight.combat.phase === 'CHOOSE' &&
    formField(formData, 'confirm') !== '1'
  ) {
    redirect('/arena?confirm=replace');
  }

  const initial = buildArenaInitial(setup.setup);
  const started = startCombat(initial);
  if (!started.ok) {
    redirect(`/arena?notice=rejected&reason=${encodeURIComponent(started.reason)}`);
  }
  await fights.start(hash, {
    origin: 'setup',
    setup: setup.setup,
    initial,
    combat: started.state,
  });
  revalidatePath('/arena');
  redirect('/arena');
}
