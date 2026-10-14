import { expect, test } from '@playwright/test';

// The Character and inventory modals on phone widths (docs/spec/ui.md,
// Character and inventory panel): modals are full-screen, both sheets stay
// readable with reachable actions, and nothing overflows horizontally.
test('phone Character and Inventory modals are readable with reachable actions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'The Whispering Woods' })
    .getByRole('link', { name: 'New Playthrough' })
    .click();
  await page.locator('#name').fill('PhoneModal');
  await page.getByRole('button', { name: 'Start the Playthrough' }).click();
  await page.getByRole('link', { name: 'Continue' }).click();

  await page.getByRole('link', { name: 'Character, Health 12/12' }).click();
  const characterDialog = page.getByRole('dialog', { name: 'Character' });
  await expect(characterDialog).toBeVisible();
  await expect(
    characterDialog.getByText("Hunter's Cloak", { exact: false }).first(),
  ).toBeVisible();
  const overflowCharacter = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowCharacter).toBeLessThanOrEqual(1);
  await page.keyboard.press('Escape');
  await expect(characterDialog).toHaveCount(0);

  await page.getByRole('link', { name: /Inventory, \d+ items/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Inventory' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Equipped' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Healing Herbs/ })).toBeVisible();
  const overflowInventory = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowInventory).toBeLessThanOrEqual(1);
  await expect(dialog.locator('.inv-detail').first()).toBeVisible();
});
