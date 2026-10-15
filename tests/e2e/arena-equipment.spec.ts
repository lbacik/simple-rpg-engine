import { expect, test, type Page } from '@playwright/test';

// The Arena Equipment (issue #169): the setup offers weapons (melee 2-4,
// ranged 2-3, unarmed), outfits and talismans with Attribute bonuses, and a
// configurable Consumable quantity; the fight honours the weapon's Damage and
// Reach and lets the Character use Consumables as an action in a Round —
// rejected at full Health.

async function expectRound(page: Page, expected: string): Promise<void> {
  await expect(page.locator('.combat-header .combat-kicker').first()).toContainText(expected);
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

test('arena equipment: a ranged weapon attacks from Far', async ({ page }) => {
  await page.goto('/arena');
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();

  // The hunting bow (ranged, 3 Damage) against the Bandit Archer, who starts
  // Far: a melee weapon could not attack from there.
  await page.getByLabel('Weapon').selectOption('hunting-bow');
  await page.getByRole('radio', { name: 'Bandit Archer' }).check();
  await page.getByRole('button', { name: 'Start the fight' }).click();
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expectRound(page, 'Round 1');

  // The equipped weapon names the Attack, which is available at Far Range and
  // resolves a Round when taken.
  await expect(page.getByRole('button', { name: /Attack: Hunting Bow/ })).toBeEnabled();
  await submitRound(page, /Attack: Hunting Bow/);
  await expectRound(page, 'Round 2');
});

test('arena equipment: consumables heal, are consumed, and refuse full Health', async ({
  page,
}) => {
  await page.goto('/arena');
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();

  // Hurt (Health 5) with two draughts against the Near grey wolf.
  await page.getByLabel(/Starting Health/).fill('5');
  await page.getByLabel(/Consumables/).fill('2');
  await page.getByRole('button', { name: 'Start the fight' }).click();
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expect(page.locator('.tactical-side .combat-health')).toContainText('5/12');

  // One draught heals 4 (the wolf answers for at most 2): Health lands on 7
  // or 9, and the Round advances.
  await submitRound(page, /Use: Healing Draught/);
  await expectRound(page, 'Round 2');
  await expect(page.locator('.tactical-side .combat-health')).toContainText(/[79]\/12/);

  // The second draught spends the last copy: the Use action leaves the panel.
  await submitRound(page, /Use: Healing Draught/);
  await expectRound(page, 'Round 3');
  await expect(page.getByRole('button', { name: /^Use:/ })).toHaveCount(0);
});

test('arena equipment: use at full Health is rejected', async ({ page }) => {
  await page.goto('/arena');
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();

  // Full Health with a draught held: the Use action is present but disabled,
  // with its reason, instead of spending anything.
  await page.getByRole('button', { name: 'Start the fight' }).click();
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expect(page.getByRole('button', { name: /Use: Healing Draught/ })).toBeDisabled();
  await expect(page.getByText('Already at full Health.')).toBeVisible();
});

test('arena equipment reads Polish under pl', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'pl-PL' });
  const page = await context.newPage();
  try {
    await page.goto('/arena');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    await expect(page.getByLabel('Broń')).toBeVisible();
    await expect(page.getByLabel(/Przedmioty jednorazowe/)).toHaveValue('1');

    // The hunting bow against the Bandit Archer: at full Health the draught
    // use is rejected in Polish...
    await page.getByLabel('Broń').selectOption('hunting-bow');
    await page.getByRole('radio', { name: 'Bandyta łucznik' }).check();
    await page.getByRole('button', { name: 'Rozpocznij walkę' }).click();
    await expect(page.getByLabel('Arena walki')).toBeVisible();
    await expect(page.getByRole('button', { name: /Użyj: Wywar leczniczy/ })).toBeDisabled();
    await expect(page.getByText('Zdrowie już pełne.')).toBeVisible();

    // ...while the ranged weapon attacks from Far into the second round.
    await submitRound(page, /Atak: Łuk myśliwski/);
    await expect(page.locator('.combat-header .combat-kicker').first()).toContainText('Runda 2');
  } finally {
    await context.close();
  }
});
