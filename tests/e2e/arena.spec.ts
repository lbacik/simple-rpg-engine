import { expect, test, type Page } from '@playwright/test';

// The Arena page: pick Bestiary Enemies, press Start, fight Rounds through
// the existing Combat presentation and actions, and land on the result screen
// with a way back to the setup. Reloading mid-fight resumes the same Combat.
// The setup offers exactly two opponent slots, each with its own starting
// Range, so a third opponent is impossible in the UI.

async function expectRound(page: Page, expected: number): Promise<void> {
  await expect(page.locator('.combat-header .combat-kicker').first()).toContainText(
    `Round ${expected}`,
  );
}

/**
 * Submit one Combat form and wait until the Round advances or the fight ends.
 * Each submission navigates, and the stale pre-navigation arena stays visible
 * until the redirect lands — waiting for the kicker to change (or the arena
 * to disappear) keeps the next count()/click pair off the stale page.
 */
async function submitRound(page: Page, name: string | RegExp): Promise<void> {
  const kicker = page.locator('.combat-header .combat-kicker').first();
  const before = ((await kicker.textContent()) ?? '').trim();
  await page.getByRole('button', { name }).click();
  await page.waitForFunction(
    (prev: string) => {
      if (!document.querySelector('[aria-label="Combat arena"]')) return true;
      const kickerEl = document.querySelector('.combat-header .combat-kicker');
      return kickerEl !== null && (kickerEl.textContent ?? '').trim() !== prev;
    },
    before,
    { timeout: 15000 },
  );
}

test('arena: start against the wolf, fight Rounds, reload, reach the result', async ({
  page,
}) => {
  // The Arena entry sits in the top navigation, reachable from the collection.
  await page.goto('/');
  await page.locator('header.topnav').getByRole('link', { name: 'Arena' }).click();
  await expect(page).toHaveURL(/\/arena$/);
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
  await expect(page.locator('ul.cards').getByText('Grey Wolf')).toBeVisible();
  await expect(page.locator('ul.cards').getByText('Bandit Archer')).toBeVisible();

  // Opponent 1 defaults to the first entry: Start begins the Combat directly.
  await page.getByRole('button', { name: 'Start the fight' }).click();
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expectRound(page, 1);

  // The wolf starts Near: one Attack resolves a Round through the Combat panel.
  await page.getByRole('button', { name: /^Attack/ }).click();
  await expectRound(page, 2);

  // Reloading mid-fight resumes the same Combat.
  await page.reload();
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expectRound(page, 2);

  // Fight to the end: victory and death both land on the result screen, so
  // keep attacking whatever the dice say until the arena is gone.
  for (let round = 0; round < 40; round += 1) {
    if ((await page.getByLabel('Combat arena').count()) === 0) break;
    await submitRound(page, /^Attack/);
  }
  await expect(page.getByLabel('Combat arena')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^Arena ·/ })).toBeVisible();

  // The result screen leads back to the setup, which lists the Bestiary again.
  await page.getByRole('button', { name: 'Back to setup' }).click();
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
  await expect(page.locator('ul.cards').getByText('Grey Wolf')).toBeVisible();
});

test('arena: escape attempts end on the result screen with a way back', async ({
  page,
}) => {
  await page.goto('/arena');
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();

  // The archer starts Far, so Escape carries its +2 bonus through the Combat
  // panel like any other action.
  await page.locator('#arena-enemy1').selectOption('bandit-archer');
  await page
    .locator('fieldset', { has: page.getByText('Opponent 1', { exact: true }) })
    .getByRole('radio', { name: 'Far' })
    .check();
  await page.getByRole('button', { name: 'Start the fight' }).click();
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expectRound(page, 1);

  // Escape attempts are legal Rounds that may fail on the dice: keep trying
  // until the fight ends however it ends.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if ((await page.getByLabel('Combat arena').count()) === 0) break;
    await submitRound(page, 'Escape');
  }
  await expect(page.getByLabel('Combat arena')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^Arena ·/ })).toBeVisible();

  await page.getByRole('button', { name: 'Back to setup' }).click();
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
  await expect(page.locator('ul.cards').getByText('Bandit Archer')).toBeVisible();
});

test('arena: two opponents at different starting Ranges share the fight', async ({
  page,
}) => {
  await page.goto('/arena');
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();

  // The setup offers exactly two opponent slots — a third is impossible.
  await expect(page.locator('#arena-enemy1')).toBeVisible();
  await expect(page.locator('#arena-enemy2')).toBeVisible();
  await expect(page.locator('#arena-enemy3')).toHaveCount(0);

  // The wolf starts Near, the archer Far: each slot keeps its own Range.
  await page.locator('#arena-enemy1').selectOption('grey-wolf');
  await page
    .locator('fieldset', { hasText: 'Opponent 1' })
    .getByRole('radio', { name: 'Near' })
    .check();
  await page.locator('#arena-enemy2').selectOption('bandit-archer');
  await page
    .locator('fieldset', { hasText: 'Opponent 2' })
    .getByRole('radio', { name: 'Far' })
    .check();
  await page.getByRole('button', { name: 'Start the fight' }).click();

  const arena = page.getByLabel('Combat arena');
  await expect(arena).toBeVisible();
  await expectRound(page, 1);

  // Both foes share the fight, each in its own lane with its own Range, and
  // the order strip holds both Intents.
  await expect(arena.getByText('Grey Wolf').first()).toBeVisible();
  await expect(arena.getByText('Bandit Archer').first()).toBeVisible();
  const lanes = arena.locator('.tactical-range');
  await expect(lanes).toHaveCount(2);
  await expect(lanes.filter({ hasText: 'Near' })).toHaveCount(1);
  await expect(lanes.filter({ hasText: 'Far' })).toHaveCount(1);
  await expect(page.locator('.combat-order-list .combat-chip[data-order-pos]')).toHaveCount(2);
  // With two survivors the target picker names both foes.
  await expect(page.locator('nav.combat-targets')).toBeVisible();

  // One Round resolves and both lanes keep their own Ranges into Round 2.
  await page.getByRole('button', { name: /^Attack/ }).click();
  await expectRound(page, 2);
  await expect(arena.getByText('Grey Wolf').first()).toBeVisible();
  await expect(arena.getByText('Bandit Archer').first()).toBeVisible();
});
