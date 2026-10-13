import { expect, test, type Page } from '@playwright/test';

// U5 (tactical-combat handoff): two tabs at the same step of a real
// two-participant save. The loser of the race sees the refreshed state with a
// stale notice and applies nothing twice; changing targets alone never stales
// the other tab.

/** Seed a fresh pair Combat and return its game URL. */
async function newPairCombatUrl(page: Page): Promise<string> {
  await page.goto('/test-tactical');
  await page.getByRole('button', { name: 'New pair Combat' }).click();
  await expect(page).toHaveURL(/\/play\/[^/]+$/);
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  return page.url();
}

async function expectRound(page: Page, expected: number): Promise<void> {
  await expect(page.locator('.combat-header .combat-kicker').first()).toContainText(
    `Round ${expected}`,
  );
}

/** The first lane's (wolf A) Health line, e.g. "8/8". */
async function laneHealth(page: Page, index: number): Promise<string> {
  const text = await page.locator('.tactical-lane .combat-health').nth(index).textContent();
  return (text ?? '').trim();
}

/** The stored Journal size from the side-panel launcher ("Journal4 entries" in text; the accessible name reads "Journal, 4 entries"). */
async function journalCount(page: Page): Promise<number> {
  const text =
    (await page.getByRole('link', { name: /Journal, \d+ entr/ }).textContent()) ?? '';
  const match = /Journal\D*(\d+)/.exec(text);
  if (!match) throw new Error(`no journal count in launcher: ${text}`);
  return Number(match[1]);
}

test('two tabs: the loser sees refreshed state with a stale notice, once', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  try {
    const url = await newPairCombatUrl(tabA);
    await tabB.goto(url);
    await expect(tabB.getByLabel('Combat arena')).toBeVisible();

    // The winner resolves Round 1 against the default target (wolf A).
    await tabA.getByRole('button', { name: /Attack/ }).click();
    await expect(tabA).toHaveURL(/\/play\/[^/]+$/);
    expect(tabA.url()).not.toMatch(/notice=/);
    await expectRound(tabA, 2);
    const journalAfterWinner = await journalCount(tabA);

    // The loser submits the same step: refreshed Round 2 state plus the
    // stale notice, and nothing applied twice.
    await tabB.getByRole('button', { name: /Attack/ }).click();
    await expect(tabB).toHaveURL(/notice=stale/);
    await expect(tabB.getByText('The game was advanced in another tab')).toBeVisible();
    await expectRound(tabB, 2);

    // Exactly one last-round callout: no duplicate round, Outcome or Journal.
    await expect(tabB.getByText(/Last round/)).toHaveCount(1);
    // No duplicate Damage: wolf A reads the same on both tabs (a second
    // applied Round would have moved it again or added another callout).
    expect(await laneHealth(tabB, 0)).toBe(await laneHealth(tabA, 0));
    // No duplicate items: both Consumables are still held.
    await expect(tabB.getByText('No Consumables held.')).toHaveCount(0);
    // No duplicate Journal: the stale submit appended nothing, so the loser
    // reads the winner's stored size exactly.
    expect(await journalCount(tabB)).toBe(journalAfterWinner);
    // Still mid-Combat: no result Continue from a phantom Outcome.
    await expect(tabB.getByRole('link', { name: 'Continue' })).toHaveCount(0);
    await expect(tabB.getByLabel('Combat arena')).toBeVisible();

    // Changing targets alone does not stale the other tab: A only follows a
    // picker link (a GET that writes nothing), then B plays the fresh step.
    await tabA.goto(`${url}?target=wolf-b`);
    await expect(tabA.getByLabel('Combat arena')).toBeVisible();
    await tabB.goto(url);
    await expectRound(tabB, 2);
    await tabB.getByRole('button', { name: /Attack/ }).click();
    await expect(tabB).toHaveURL(/\/play\/[^/]+$/);
    expect(tabB.url()).not.toMatch(/notice=/);
    await expectRound(tabB, 3);
  } finally {
    await context.close();
  }
});
