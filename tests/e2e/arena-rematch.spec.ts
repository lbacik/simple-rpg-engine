import { expect, test, type Page } from '@playwright/test';

// The rematch (issue #171): after a fight the result screen shows the fight
// summary (outcome, Rounds fought, remaining Health, hits and misses on both
// sides), Fight again starts a new Combat with the identical setup and fresh
// Health, Range and Intents, and the last setup is remembered per Session —
// reopening the Arena restores it, across a reload and a new tab.

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

/** Escape until the fight ends however the dice fall, landing on the result. */
async function fightToResult(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if ((await page.getByLabel('Combat arena').count()) === 0) break;
    await submitRound(page, 'Escape');
  }
  await expect(page.getByLabel('Combat arena')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /^Arena ·/ })).toBeVisible();
}

test('arena rematch: summary, fight again fresh, remembered setup', async ({ page }) => {
  await page.goto('/arena');
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();

  // A distinctive setup to remember: the hunting bow, hurt at 5 with two
  // draughts, against the Bandit Archer starting Far.
  await page.getByLabel('Weapon').selectOption('hunting-bow');
  await page.getByLabel(/Starting Health/).fill('5');
  await page.getByLabel(/Consumables/).fill('2');
  await page.locator('#arena-enemy1').selectOption('bandit-archer');
  await page
    .locator('fieldset', { hasText: 'Opponent 1' })
    .getByRole('radio', { name: 'Far' })
    .check();
  await page.getByRole('button', { name: 'Start the fight' }).click();
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expectRound(page, 1);

  await fightToResult(page);

  // The result screen carries the fight summary: the outcome, the Rounds
  // fought, the remaining Health on both sides, and hits and misses per side.
  const summary = page.getByRole('region', { name: 'Fight summary' });
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('Outcome:');
  await expect(summary).toContainText('Rounds fought:');
  await expect(summary).toContainText('Remaining Health:');
  await expect(summary).toContainText(/You:.*Health \d+\/12/);
  await expect(summary).toContainText('Bandit Archer');
  await expect(summary).toContainText(/You:.*hits? ·.*miss/);
  await expect(summary).toContainText(/Bandit Archer:.*hits? ·.*miss/);

  // Fight again restarts the identical setup with fresh state: Round 1, hurt
  // at 5 again, the bow naming the Attack.
  await page.getByRole('button', { name: 'Fight again' }).click();
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expectRound(page, 1);
  await expect(page.locator('.tactical-side .combat-health')).toContainText('5/12');
  await expect(page.getByRole('button', { name: /Attack: Hunting Bow/ })).toBeEnabled();

  // Ending the rematch and going back lands on the setup with the remembered
  // choices still in place.
  await fightToResult(page);
  await expect(page.getByRole('region', { name: 'Fight summary' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to setup' }).click();
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
  await expect(page.getByLabel('Weapon')).toHaveValue('hunting-bow');
  await expect(page.getByLabel(/Starting Health/)).toHaveValue('5');
  await expect(page.getByLabel(/Consumables/)).toHaveValue('2');
  await expect(page.locator('#arena-enemy1')).toHaveValue('bandit-archer');

  // The remembered setup survives a reload...
  await page.reload();
  await expect(page.getByLabel('Weapon')).toHaveValue('hunting-bow');
  await expect(page.locator('#arena-enemy1')).toHaveValue('bandit-archer');

  // ...and a new tab within the same Session.
  const second = await page.context().newPage();
  try {
    await second.goto('/arena');
    await expect(second.getByRole('heading', { name: 'Arena' })).toBeVisible();
    await expect(second.getByLabel('Weapon')).toHaveValue('hunting-bow');
    await expect(second.getByLabel(/Starting Health/)).toHaveValue('5');
    await expect(second.locator('#arena-enemy1')).toHaveValue('bandit-archer');
  } finally {
    await second.close();
  }
});
