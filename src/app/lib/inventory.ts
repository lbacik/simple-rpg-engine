// The inventory server actions: Equip, Unequip and Use item post here as
// plain forms, so inventory management works without JavaScript
// (docs/spec/architecture.md, turn transport).
//
// Each submission re-checks, in order: the Session, ownership of the
// Playthrough, `step`, then legality in the engine (via executeTurn). The
// Session cookie's Max-Age slides on every action. Rejections change nothing
// and redirect back with a transient notice; there is no error page. Another
// Session's Playthrough, or a nonexistent one, is a 404. The redirect lands
// back with the Inventory modal open (`?panel=inventory`), so Equip, Unequip
// and Use — and their rejection notices — return to the game screen with the
// modal still open and the notice visible.

'use server';

import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { getScenario } from '@/content/registry';
import type { Action } from '@/engine/index';
import { isEquipmentSlot } from '@/engine/inventory';
import { getDatabase } from '@/persistence/index';
import { parseSeenStep, playHref } from './panel';
import { ensureSessionId, getSessionHash } from './session';
import { executeTurn } from './turn';

type InventoryForm = {
  playthroughId: string;
  expectedStep: number;
  value: string;
  seen: number | undefined;
  showUnknownExits: boolean;
  /** The tile selected in the detail pane, preserved across the redirect. */
  selectedItem: string | undefined;
};

function readForm(formData: FormData, field: string): InventoryForm | null {
  const playthroughId = String(formData.get('playthroughId') ?? '');
  const expectedStep = Number(String(formData.get('expectedStep') ?? ''));
  const value = String(formData.get(field) ?? '');
  if (playthroughId === '' || !Number.isInteger(expectedStep) || value === '') {
    return null;
  }
  const seenRaw = formData.get('seen');
  const selectedRaw = formData.get('item');
  return {
    playthroughId,
    expectedStep,
    value,
    // The Continue acknowledgement and the "?" map setting ride along so the
    // redirect lands back on the same view.
    seen: seenRaw === null ? undefined : parseSeenStep(String(seenRaw)),
    showUnknownExits: String(formData.get('unknown') ?? '') === '1',
    // The selected tile survives the redirect after the action, so the result
    // is visible in place (or the first item, when the selected one is gone).
    selectedItem:
      selectedRaw === null || String(selectedRaw).trim() === ''
        ? undefined
        : String(selectedRaw).trim(),
  };
}

async function runInventoryTurn(form: InventoryForm, action: Action): Promise<never> {
  const sessionHash = await getSessionHash();
  // Sliding refresh: re-set the same id with a fresh Max-Age.
  await ensureSessionId();

  const result = await executeTurn(
    getDatabase(),
    getScenario,
    form.playthroughId,
    sessionHash,
    action,
    randomInt,
  );
  const path = `/play/${form.playthroughId}`;
  if (result.ok) {
    revalidatePath(path);
    // The turn advanced `step`, so the old acknowledgement is stale and stays
    // behind; the "?" map setting is preserved. The Inventory modal stays open
    // with the same tile selected.
    redirect(
      playHref(
        form.playthroughId,
        'inventory',
        undefined,
        undefined,
        form.showUnknownExits,
        form.selectedItem,
      ),
    );
  }
  if (result.reason === 'not-found') {
    notFound();
  }
  revalidatePath(path);
  // A rejection changes nothing and does not advance `step`, so the
  // acknowledgement still matches and the acknowledged position stays visible.
  // The Inventory modal stays open and the notice is shown inside it.
  redirect(
    playHref(
      form.playthroughId,
      'inventory',
      result.reason === 'stale' ? 'stale' : 'unavailable',
      form.seen,
      form.showUnknownExits,
      form.selectedItem,
    ),
  );
}

export async function equipAction(formData: FormData): Promise<never> {
  const form = readForm(formData, 'itemId');
  if (form === null) {
    notFound();
  }
  return runInventoryTurn(
    form,
    { kind: 'equip', itemId: form.value, expectedStep: form.expectedStep },
  );
}

export async function unequipAction(formData: FormData): Promise<never> {
  const form = readForm(formData, 'slot');
  if (form === null) {
    notFound();
  }
  if (!isEquipmentSlot(form.value)) {
    // A forged slot value fails fast with the unavailable notice; the engine
    // re-validates real slots independently.
    await ensureSessionId();
    revalidatePath(`/play/${form.playthroughId}`);
    redirect(
      playHref(
        form.playthroughId,
        'inventory',
        'unavailable',
        form.seen,
        form.showUnknownExits,
        form.selectedItem,
      ),
    );
  }
  return runInventoryTurn(
    form,
    { kind: 'unequip', slot: form.value, expectedStep: form.expectedStep },
  );
}

export async function useItemAction(formData: FormData): Promise<never> {
  const form = readForm(formData, 'itemId');
  if (form === null) {
    notFound();
  }
  return runInventoryTurn(
    form,
    { kind: 'use-item', itemId: form.value, expectedStep: form.expectedStep },
  );
}
