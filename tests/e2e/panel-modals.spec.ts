import { expect, test } from '@playwright/test';

// The side-panel launchers and modals (docs/spec/ui.md, Character and
// inventory panel): the Character sheet and the inventory open in modals over
// the game screen, the open modal is part of the URL, and Unequip/Equip land
// back with the Inventory modal still open.
test('the Inventory modal unequips and equips with the modal open', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'The Whispering Woods' })
    .getByRole('link', { name: 'New Playthrough' })
    .click();
  await page.locator('#name').fill('Modal');
  await page.getByRole('button', { name: 'Start the Playthrough' }).click();

  // The default Template is the Hunter, who starts with a Hunter's Cloak
  // equipped in the outfit slot.
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();

  // The side panel shows the status card and the launchers with sublabels.
  await expect(page.getByRole('link', { name: 'Character, Health 12/12' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Inventory, \d+ items/ })).toBeVisible();

  // The Character launcher opens the Character sheet in a modal and reflects
  // it in the URL. Escape closes it and returns focus to the launcher.
  await page.getByRole('link', { name: 'Character, Health 12/12' }).click();
  const characterDialog = page.getByRole('dialog', { name: 'Character' });
  await expect(characterDialog).toBeVisible();
  await expect(page).toHaveURL(/panel=character/);
  await expect(characterDialog.getByText("Hunter's Cloak", { exact: false }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(characterDialog).toHaveCount(0);
  expect(page.url()).not.toMatch(/panel=/);
  await expect(page.getByRole('link', { name: 'Character, Health 12/12' })).toBeFocused();

  // The Inventory launcher opens the inventory in a modal.
  await page.getByRole('link', { name: /Inventory, \d+ items/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Inventory' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/panel=inventory/);

  // Unequip lands back with the Inventory modal still open.
  await dialog
    .locator('p', { hasText: "Hunter's Cloak is equipped" })
    .getByRole('button', { name: 'Unequip' })
    .click();
  await expect(page).toHaveURL(/panel=inventory/);
  await expect(page.getByRole('dialog', { name: 'Inventory' })).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Inventory' }).getByText('The outfit slot is empty.'),
  ).toBeVisible();

  // Equip lands back with the Inventory modal still open.
  await page
    .getByRole('dialog', { name: 'Inventory' })
    .locator('li', { hasText: "Hunter's Cloak" })
    .getByRole('button', { name: 'Equip' })
    .click();
  await expect(page).toHaveURL(/panel=inventory/);
  await expect(page.getByRole('dialog', { name: 'Inventory' })).toBeVisible();
  await expect(
    page
      .getByRole('dialog', { name: 'Inventory' })
      .getByText("Hunter's Cloak is equipped in the outfit slot."),
  ).toBeVisible();

  // The close button closes the modal and returns focus to the launcher.
  await page
    .getByRole('dialog', { name: 'Inventory' })
    .getByRole('link', { name: 'Close Inventory' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.url()).not.toMatch(/panel=/);
  await expect(page.getByRole('link', { name: /Inventory, \d+ items/ })).toBeFocused();

  // The Journal launcher reaches the full Journal page.
  await page.getByRole('link', { name: /Journal, \d+ entr/ }).click();
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
});

// On phones the status card and launchers replace the compact summary, and a
// Map launcher opens the map in a full-screen modal that map travel works from.
test('the phone Map launcher opens the map and travels from it', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'The Whispering Woods' })
    .getByRole('link', { name: 'New Playthrough' })
    .click();
  await page.locator('#name').fill('Phone');
  await page.getByRole('button', { name: 'Start the Playthrough' }).click();
  await page.getByRole('link', { name: 'Continue' }).click();

  // The side panel shows the status card and launchers; the inline map hides
  // behind the Map launcher and the compact summary is gone.
  await expect(page.getByLabel('Character status')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Map' })).toBeVisible();
  await expect(page.locator('.map-inline')).toBeHidden();
  await expect(page.locator('.compact-summary')).toHaveCount(0);

  // Reach the Ashford Location view, where map travel is available.
  await page.getByRole('button', { name: 'Hear her out.' }).click();
  await page.getByRole('button', { name: 'Promise to find Mira.' }).click();
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Ashford' })).toBeVisible();

  // The Map launcher opens the map in a modal reflected in the URL.
  await page.getByRole('link', { name: 'Map' }).click();
  const mapDialog = page.getByRole('dialog', { name: 'Location map' });
  await expect(mapDialog).toBeVisible();
  await expect(page).toHaveURL(/panel=map/);

  // Unvisited exits draw as "?" nodes once enabled; travelling from the modal
  // works exactly like the matching exit button.
  await mapDialog.getByRole('link', { name: /Show unvisited exits/ }).click();
  await expect(page.getByRole('dialog', { name: 'Location map' })).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Location map' })
    .getByRole('button', { name: 'Travel to Forest Edge' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.url()).not.toMatch(/panel=/);
  // Travelling to Forest Edge opens its arrival scene ("The Whispering
  // Trees") instead of the bare Location view.
  await expect(
    page
      .getByRole('heading', { name: 'Forest Edge' })
      .or(page.getByRole('link', { name: 'Continue' }))
      .or(page.getByRole('heading', { name: 'The Whispering Trees' })),
  ).toBeVisible();
});
