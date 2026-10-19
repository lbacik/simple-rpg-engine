// Arena import route (Combat MVP 1.0, P5 A3): a plain POST, so import works
// without JavaScript. One submission carries a fight file, pasted JSON, or
// both (the file wins); all three go through the one strict import
// `prepareArenaImport` (1 MB cap, PLAN through `startCombat`, CHOOSE
// verified by recomputation, FINISHED view-only). Every failure redirects
// with its ParseIssue code, rendered as Interface Text on the page.
// Replacing a CHOOSE fight needs the in-page confirmation (`confirm=1`); the
// store advances the monotonic step, so a tab from the replaced fight never
// matches.

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ARENA_IMPORT_MAX_BYTES, prepareArenaImport } from '@/engine/combat/index';
import type { ParseIssue } from '@/engine/combat/index';
import { arenaFights, ensureArenaSession, formField } from '../server';

function rejected(issue: ParseIssue): never {
  const query = new URLSearchParams({ notice: 'rejected', reason: issue.code });
  for (const [key, value] of Object.entries(issue.params ?? {})) {
    // `reason` carries the issue code on the URL; a parameter of the same
    // name rides as `detail` so it never overwrites the code (the page reads
    // it back under that name).
    query.set(key === 'reason' ? 'detail' : key, String(value));
  }
  redirect(`/arena?${query.toString()}`);
}

export async function POST(request: Request): Promise<never> {
  const formData = await request.formData();
  const { hash } = await ensureArenaSession();
  const fights = arenaFights();

  // The file wins over the paste; an empty file input falls through to the
  // textarea. Files over the cap are rejected before buffering their text;
  // the shared strict parse enforces the same cap on pasted text.
  const fileValue = formData.get('file');
  let text: string | null = null;
  if (fileValue instanceof File && fileValue.size > 0) {
    if (fileValue.size > ARENA_IMPORT_MAX_BYTES) rejected({ code: 'bad_state' });
    text = await fileValue.text();
  }
  if (text === null) {
    const pasted = formData.get('pasted');
    if (typeof pasted === 'string' && pasted.trim() !== '') text = pasted;
  }
  if (text === null) rejected({ code: 'bad_state' });

  const prepared = prepareArenaImport(text);
  if (!prepared.ok) rejected(prepared.issues[0] ?? { code: 'bad_state' });

  const current = await fights.read(hash);
  if (
    current.status === 'ready' &&
    current.fight.combat.phase === 'CHOOSE' &&
    formField(formData, 'confirm') !== '1'
  ) {
    redirect('/arena?confirm=replace');
  }
  await fights.start(hash, {
    origin: 'import',
    setup: null,
    initial: prepared.initial,
    combat: prepared.combat,
  });
  revalidatePath('/arena');
  redirect('/arena');
}
