import { expect, test } from '@playwright/test';

// The journal modal (docs/spec/ui.md, journal): the side-panel Journal
// launcher opens the Journal over the game screen instead of navigating away.
// Inside, the Journal scrolls infinitely within the modal with its position
// indicator, and closing returns to the unchanged game screen, including an
// undismissed outcome modal (closing the Journal never acknowledges it).
test('journal launcher opens in a modal, scrolls older entries, closes unchanged', async ({
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
  await page.getByRole('link', { name: /Inventory, \d+ items/ }).click();
  const inventoryDialog = page.getByRole('dialog', { name: 'Inventory' });
  await expect(inventoryDialog).toBeVisible();
  const cloakTile = inventoryDialog.getByRole('button', { name: /Hunter's Cloak/ });
  const unequipOutfit = inventoryDialog
    .locator('.inv-slot', { hasText: "Hunter's Cloak" })
    .getByRole('button', { name: 'Unequip' });
  for (let round = 0; round < 11; round += 1) {
    await unequipOutfit.click();
    await expect(cloakTile).toBeEnabled();
    await cloakTile.click();
    await expect(
      inventoryDialog.locator('.inv-detail').getByRole('button', { name: 'Equip' }),
    ).toBeVisible();
    await inventoryDialog.locator('.inv-detail').getByRole('button', { name: 'Equip' }).click();
    await expect(unequipOutfit).toBeVisible();
  }
  await inventoryDialog.getByRole('link', { name: 'Close Inventory' }).click();
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();

  // Wait for hydration: the modal intercepts the click on the client, so a
  // click before React attaches would follow the plain journal link instead.
  await page.waitForLoadState('networkidle');

  const url = page.url();
  const journalLauncher = page.getByRole('link', { name: /Journal, \d+ entr/ });
  await expect(journalLauncher).toBeVisible();

  // Opening the modal navigates nowhere: the game screen stays as it was.
  await journalLauncher.click();
  const dialog = page.getByRole('dialog', { name: 'Journal' });
  await expect(dialog).toBeVisible();
  expect(page.url()).toBe(url);
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('hidden');

  // The modal header names the Journal with its total and offers "Open in new
  // tab" to the full Journal page.
  await expect(dialog.locator('.journal-position-text')).toBeVisible();
  await expect(dialog.getByText(/\d+ entries\./)).toBeVisible();
  const openInNewTab = dialog.getByRole('link', { name: 'Open in new tab' });
  await expect(openInNewTab).toHaveAttribute('href', /\/play\/.+\/journal$/);
  await expect(openInNewTab).toHaveAttribute('target', '_blank');

  // One batch on screen; scrolling the modal body loads older entries, and
  // the position indicator tracks the modal's scroll: the entry at the top
  // of the viewport changes as older entries scroll by.
  const body = page.getByTestId('journal-modal-body');
  const positionText = dialog.locator('.journal-position-text');
  await expect.poll(() => body.locator('li[data-seq]').count()).toBe(20);
  const positionBefore = await positionText.textContent();
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => body.locator('li[data-seq]').count(), { timeout: 15_000 })
    .toBeGreaterThan(20);
  await expect.poll(() => positionText.textContent()).not.toBe(positionBefore);

  // Escape closes the modal, returns focus to the launcher, unlocks the
  // background scroll, and leaves the game screen unchanged.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(journalLauncher).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  expect(page.url()).toBe(url);
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();

  // The close button closes the same way.
  await journalLauncher.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(journalLauncher).toBeFocused();
  expect(page.url()).toBe(url);

  // So does a backdrop click.
  await journalLauncher.click();
  await expect(dialog).toBeVisible();
  await page.locator('.journal-modal-backdrop').click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeHidden();
  await expect(journalLauncher).toBeFocused();
  expect(page.url()).toBe(url);
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();
});

test('journal modal returns to an undismissed outcome modal unchanged', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Two Bridges' })
    .getByRole('link', { name: 'New Playthrough' })
    .click();
  await page.locator('#name').fill('ResultModal');
  await page.getByRole('button', { name: 'Start the Playthrough' }).click();
  await page.getByRole('link', { name: 'Continue' }).click();

  // A Choice without a Test lands on an outcome modal with Continue over the
  // destination Location.
  await page.getByRole('button', { name: 'Ask what key he means.' }).click();
  const outcome = page.getByRole('dialog', { name: 'Latest events' });
  await expect(outcome).toBeVisible();
  await expect(outcome.getByRole('link', { name: 'Continue' })).toBeVisible();
  await expect(outcome).toContainText('The brass key, lost on the far side');

  const url = page.url();
  const journalLauncher = page.getByRole('link', { name: /Journal, \d+ entr/ });
  await journalLauncher.click();
  const dialog = page.getByRole('dialog', { name: 'Journal' });
  await expect(dialog).toBeVisible();
  expect(page.url()).toBe(url);
  await expect.poll(() => dialog.locator('li[data-seq]').count()).toBeGreaterThan(0);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(page.url()).toBe(url);
  // The undismissed outcome modal is still there with its Continue: closing
  // the Journal never acknowledges the presentation beneath it.
  await expect(outcome).toBeVisible();
  await expect(outcome.getByRole('link', { name: 'Continue' })).toBeVisible();
  await expect(outcome).toContainText('The brass key, lost on the far side');
  await expect(journalLauncher).toBeFocused();
});

test('standalone journal stays reachable directly and from a new tab', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'The Whispering Woods' })
    .getByRole('link', { name: 'New Playthrough' })
    .click();
  await page.locator('#name').fill('Standalone');
  await page.getByRole('button', { name: 'Start the Playthrough' }).click();
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();

  // Direct standalone access renders the newest batch with its total.
  const gameUrl = page.url();
  const playthroughId = gameUrl.split('/play/')[1]?.split('?')[0];
  await page.goto(`/play/${playthroughId}/journal`);
  await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
  await expect(page.locator('ol li[data-seq]').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the game' })).toHaveAttribute(
    'href',
    `/play/${playthroughId}`,
  );

  // Back on the game screen, "Open in new tab" points at that standalone page.
  await page.goto(gameUrl);
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: /Journal, \d+ entr/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Journal' });
  await expect(dialog).toBeVisible();
  const href = await dialog.getByRole('link', { name: 'Open in new tab' }).getAttribute('href');
  expect(href).toMatch(/\/play\/.+\/journal$/);
  const newTab = await context.newPage();
  await newTab.goto(href!);
  await expect(newTab.getByRole('heading', { name: 'Journal' })).toBeVisible();
  await newTab.close();
});
