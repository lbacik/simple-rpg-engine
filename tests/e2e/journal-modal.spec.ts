import { expect, test } from '@playwright/test';

// The journal modal (docs/spec/ui.md, journal): "View journal" opens the
// Journal over the game screen instead of navigating away. Inside, the
// Journal scrolls infinitely within the modal with its position indicator,
// and closing returns to the unchanged game screen.
test('view journal opens in a modal, scrolls older entries, closes unchanged', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'The Whispering Woods' })
    .getByRole('link', { name: 'New Playthrough' })
    .click();
  await page.locator('#name').fill('Modal');
  await page.getByRole('button', { name: 'Start the Playthrough' }).click();

  await expect(page).toHaveURL(/\/play\/[^/]+$/);
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();

  // Grow the Journal past one batch (20 entries) with inventory turns, which
  // never leave the position: unequip and re-equip the cloak in a loop.
  const panel = page.locator('.side .full');
  await panel.getByRole('link', { name: 'Inventory' }).click();
  const cloak = panel.locator('li.item', { hasText: "Hunter's Cloak" });
  // The slot paragraph and its form are siblings (the parser closes the
  // paragraph before the form), so the outfit form is found by its slot input.
  const unequipOutfit = panel
    .locator('form:has(input[name="slot"][value="outfit"])')
    .getByRole('button', { name: 'Unequip' });
  for (let round = 0; round < 11; round += 1) {
    await unequipOutfit.click();
    await expect(cloak.getByRole('button', { name: 'Equip' })).toBeEnabled();
    await cloak.getByRole('button', { name: 'Equip' }).click();
    await expect(unequipOutfit).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();

  // Wait for hydration: the modal intercepts the click on the client, so a
  // click before React attaches would follow the plain journal link instead.
  await page.waitForLoadState('networkidle');

  const url = page.url();
  const journalLink = page.getByRole('link', { name: 'View journal' });
  await expect(journalLink).toBeVisible();

  // Opening the modal navigates nowhere: the game screen stays as it was.
  await journalLink.click();
  const dialog = page.getByRole('dialog', { name: 'Journal' });
  await expect(dialog).toBeVisible();
  expect(page.url()).toBe(url);
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue' })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

  // The modal Journal is newest first with its position indicator, and "Open
  // in new tab" points at the full Journal page.
  await expect(dialog.locator('.journal-position-text')).toBeVisible();
  const openInNewTab = dialog.getByRole('link', { name: 'Open in new tab' });
  await expect(openInNewTab).toHaveAttribute('href', /\/play\/.+\/journal$/);
  await expect(openInNewTab).toHaveAttribute('target', '_blank');

  // One batch on screen; scrolling the modal body loads older entries.
  const body = page.getByTestId('journal-modal-body');
  await expect.poll(() => body.locator('li[data-seq]').count()).toBe(20);
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => body.locator('li[data-seq]').count(), { timeout: 15_000 })
    .toBeGreaterThan(20);

  // Escape closes the modal, returns focus to the trigger, unlocks the
  // background scroll, and leaves the game screen unchanged.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(journalLink).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(page.url()).toBe(url);
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continue' })).toHaveCount(0);

  // The close button closes the same way.
  await journalLink.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(journalLink).toBeFocused();
  expect(page.url()).toBe(url);

  // So does a backdrop click.
  await journalLink.click();
  await expect(dialog).toBeVisible();
  await page.locator('.journal-modal-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeHidden();
  await expect(journalLink).toBeFocused();
  expect(page.url()).toBe(url);
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();
});
