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

  // The Inventory launcher opens the inventory in a modal: the equipped
  // paper doll beside the carried tiles, with a detail pane for the selected
  // tile.
  await page.getByRole('link', { name: /Inventory, \d+ items/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Inventory' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/panel=inventory/);

  // The equipped slots: the bow and the cloak filled, the talisman empty.
  await expect(dialog.getByRole('heading', { name: 'Equipped' })).toBeVisible();
  await expect(dialog.locator('.inv-slot', { hasText: 'Hunting Bow' })).toBeVisible();
  await expect(dialog.locator('.inv-slot', { hasText: "Hunter's Cloak" })).toBeVisible();
  await expect(dialog.locator('.inv-slot.empty')).toHaveCount(1);

  // One tile per carried item; the first tile is selected by default.
  const tiles = dialog.locator('.inv-tile');
  await expect(tiles).toHaveCount(3);
  await expect(tiles.first()).toHaveAttribute('aria-pressed', 'true');

  // Selecting a tile shows it in the detail pane. At full Health, Use is
  // disabled with its reason.
  await dialog.getByRole('button', { name: /Healing Herbs/ }).click();
  await expect(dialog.getByRole('button', { name: /Healing Herbs/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const detail = dialog.locator('.inv-detail');
  await expect(detail.getByText('Healing Herbs')).toBeVisible();
  await expect(detail.getByText('× 2')).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Use' })).toBeDisabled();
  await expect(detail.getByText('Already at full Health.')).toBeVisible();

  // Unequip from the slot lands back with the Inventory modal still open and
  // the same tile selected.
  await dialog
    .locator('.inv-slot', { hasText: "Hunter's Cloak" })
    .getByRole('button', { name: 'Unequip' })
    .click();
  await expect(page).toHaveURL(/panel=inventory/);
  await expect(page).toHaveURL(/item=healing-herbs/);
  await expect(page.getByRole('dialog', { name: 'Inventory' })).toBeVisible();
  await expect(dialog.locator('.inv-slot.empty')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: /Healing Herbs/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(dialog.locator('.inv-detail').getByText('Healing Herbs')).toBeVisible();

  // Selecting the cloak tile and equipping from the detail pane fills the
  // outfit slot again, with the modal still open.
  await dialog.getByRole('button', { name: /Hunter's Cloak/ }).click();
  const cloakDetail = dialog.locator('.inv-detail');
  await expect(cloakDetail.getByText("Hunter's Cloak")).toBeVisible();
  await cloakDetail.getByRole('button', { name: 'Equip' }).click();
  await expect(page).toHaveURL(/panel=inventory/);
  await expect(page).toHaveURL(/item=hunters-cloak/);
  await expect(page.getByRole('dialog', { name: 'Inventory' })).toBeVisible();
  await expect(
    dialog.locator('.inv-slot', { hasText: "Hunter's Cloak" }).getByText("Hunter's Cloak"),
  ).toBeVisible();

  // The close button closes the modal and returns focus to the launcher.
  await page
    .getByRole('dialog', { name: 'Inventory' })
    .getByRole('link', { name: 'Close Inventory' })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(page.url()).not.toMatch(/panel=/);
  await expect(page.getByRole('link', { name: /Inventory, \d+ items/ })).toBeFocused();

  // The Journal launcher opens the Journal in a modal over the game screen,
  // with an "Open in new tab" link to the full Journal page.
  const gameUrl = page.url();
  await page.getByRole('link', { name: /Journal, \d+ entr/ }).click();
  const journalDialog = page.getByRole('dialog', { name: 'Journal' });
  await expect(journalDialog).toBeVisible();
  expect(page.url()).toBe(gameUrl);
  await expect(journalDialog.getByRole('link', { name: 'Open in new tab' })).toHaveAttribute(
    'href',
    /\/journal$/,
  );
  await page.keyboard.press('Escape');
  await expect(journalDialog).toHaveCount(0);

  // The standalone Journal page stays directly reachable.
  await page.goto(`${gameUrl.split('?')[0]}/journal`);
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
});

// On desktop the Map launcher sits beside the other launchers and opens the
// expanded map modal while the compact map stays visible; the toggle stays
// consistent between the two presentations.
test('the desktop Map launcher opens the expanded modal over the compact map', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'The Whispering Woods' })
    .getByRole('link', { name: 'New Playthrough' })
    .click();
  await page.locator('#name').fill('Desktop');
  await page.getByRole('button', { name: 'Start the Playthrough' }).click();
  await page.getByRole('link', { name: 'Continue' }).click();

  // Reach the Ashford Location view, where map travel is available.
  await page.getByRole('button', { name: 'Hear her out.' }).click();
  await page.getByRole('button', { name: 'Promise to find Mira.' }).click();
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Ashford' })).toBeVisible();

  // The Map launcher is visible on desktop and the compact map is shown.
  await expect(page.getByRole('link', { name: 'Map' })).toBeVisible();
  await expect(page.locator('.map-inline')).toBeVisible();

  // The launcher opens the expanded map in a modal reflected in the URL,
  // with the compact map still in place behind it.
  await page.getByRole('link', { name: 'Map' }).click();
  const mapDialog = page.getByRole('dialog', { name: 'Location map' });
  await expect(mapDialog).toBeVisible();
  await expect(page).toHaveURL(/panel=map/);
  await expect(page.locator('.map-inline')).toBeVisible();

  // The modal toggle flips the shared setting and stays open on the modal.
  await mapDialog.getByRole('link', { name: 'Show unseen exits' }).click();
  await expect(page.getByRole('dialog', { name: 'Location map' })).toBeVisible();
  await expect(page).toHaveURL(/unknown=1/);
  await expect(
    mapDialog.getByRole('link', { name: 'Hide unseen exits' }),
  ).toBeVisible();

  // Escape closes the modal and returns focus to the Map launcher.
  await page.keyboard.press('Escape');
  await expect(mapDialog).toHaveCount(0);
  expect(page.url()).not.toMatch(/panel=map/);
  await expect(page.getByRole('link', { name: 'Map' })).toBeFocused();
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

  // Unseen exits draw as "?" nodes once enabled; travelling from the modal
  // works exactly like the matching exit button.
  await mapDialog.getByRole('link', { name: 'Show unseen exits' }).click();
  await expect(mapDialog.getByRole('link', { name: 'Hide unseen exits' })).toBeVisible();
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
