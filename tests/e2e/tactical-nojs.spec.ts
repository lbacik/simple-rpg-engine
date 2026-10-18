import { expect, test, type Page } from '@playwright/test';

// U4 (tactical-combat handoff): the full no-JavaScript flow through a real
// two-participant save. Every step works through links and plain forms —
// JavaScript is disabled for this file — against the pair fixture seeded by
// the test-only entry path, never a mocked panel.

test.use({ javaScriptEnabled: false });

/** Seed a fresh pair Combat and land on its arena. */
async function newPairCombat(page: Page): Promise<void> {
  await page.goto('/test-tactical');
  await page.getByRole('button', { name: 'New pair Combat' }).click();
  await expect(page).toHaveURL(/\/play\/[^/]+$/);
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expectRound(page, 1);
}

async function expectRound(page: Page, expected: number): Promise<void> {
  await expect(page.locator('.combat-header .combat-kicker').first()).toContainText(
    `Round ${expected}`,
  );
}

async function characterHealth(page: Page): Promise<{ now: number; max: number }> {
  const launcher = page.getByRole('link', { name: /Health \d+\/\d+/ }).first();
  const label =
    (await launcher.getAttribute('aria-label')) ?? (await launcher.textContent()) ?? '';
  const match = /Health (\d+)\/(\d+)/.exec(label);
  if (!match) throw new Error(`no health in launcher: ${label}`);
  return { now: Number(match[1]), max: Number(match[2]) };
}

async function laneHealth(page: Page, index: number): Promise<string> {
  const text = await page.locator('.tactical-lane .combat-health').nth(index).textContent();
  return (text ?? '').trim();
}

/** Click a Combat submit button and require the success redirect (no notice). */
async function submitCombat(page: Page, name: string | RegExp): Promise<void> {
  await page.getByRole('button', { name }).click();
  await expect(page).toHaveURL(/\/play\/[^/]+$/);
  expect(page.url()).not.toMatch(/notice=/);
}

test('no-JavaScript: intents, target B, every action group, escape, Continue, Journal', async ({
  page,
}) => {
  await newPairCombat(page);

  // Read the committed Intents: two lanes with bubbles and an order strip.
  await expect(page.locator('.tactical-intent')).toHaveCount(2);
  const orderItems = page.locator('.combat-order-list .combat-chip:not(.is-hint)');
  await expect(orderItems).toHaveCount(2);

  // The target picker offers both survivors; selecting B writes nothing.
  const picker = page.getByLabel('Target', { exact: true });
  await expect(picker.getByRole('link', { name: /Grey Wolf A/ })).toBeVisible();
  await expect(picker.getByRole('link', { name: /Grey Wolf B/ })).toBeVisible();
  await picker.getByRole('link', { name: /Grey Wolf B/ }).click();
  await expect(page).toHaveURL(/target=wolf-b/);
  await expect(picker.getByRole('link', { name: /Grey Wolf B/ })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expectRound(page, 1);

  // At full Health the Consumable shows its reason instead of a form.
  await expect(page.getByRole('button', { name: /Use: Healing Herbs/ })).toBeDisabled();
  await expect(page.getByText('Already at full Health.')).toBeVisible();

  // Advance on B: B is Far, so the targeted form is enabled.
  await submitCombat(page, 'Advance');
  await expectRound(page, 2);

  // Distract B through its form.
  await submitCombat(page, 'Distract');
  await expectRound(page, 3);

  // Trade Attacks (alternating lanes so neither wolf falls) until the wolves
  // land a hit, then use the hurt round to heal through the item form.
  let healed = false;
  for (let round = 0; round < 10 && !healed; round += 1) {
    const health = await characterHealth(page);
    if (health.now < health.max) {
      await submitCombat(page, /Use: Healing Herbs/);
      healed = true;
    } else {
      await submitCombat(page, /Attack/);
    }
  }
  expect(healed).toBe(true);
  // The round report names the consumed item (the full Journal entry reads
  // `Used: …` on the Journal page asserted below). Scoped to the log: the
  // items group holds a same-named action button.
  await expect(page.locator('.combat-log').getByText(/Use: Healing Herbs/)).toBeVisible();

  // Escape through its form, retrying failures: each attempt is a legal Round
  // and the Combat cannot end in victory while wolf A stands untouched. Death
  // would show the Ending instead of the arena: fail loudly rather than loop.
  let escaped = false;
  for (let attempt = 0; attempt < 12 && !escaped; attempt += 1) {
    await page.getByRole('button', { name: 'Escape' }).click();
    await expect(page).toHaveURL(/\/play\/[^/]+$/);
    const stillFighting = await page.getByLabel('Combat arena').count();
    escaped = stillFighting === 0;
    if (!escaped) expect(page.url()).not.toMatch(/notice=/);
  }
  expect(escaped).toBe(true);
  await expect(page.getByRole('heading', { name: 'Gone' })).toHaveCount(0);

  // The Escape Outcome lands on the outcome modal over the Location: Continue, then the Journal.
  await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByLabel('Combat arena')).toHaveCount(0);
  await page.getByRole('link', { name: /Journal, \d+ entr/ }).click();
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
  await expect(page.getByText(/Grey Wolf B/).first()).toBeVisible();
  // The consumed item reached the stored Journal, not just the round report:
  // walk the no-JS "Older entries" pages (a long fight paginates) until its
  // `Use:` row shows. (The Journal inlines the use into its round entry as
  // `Use: …`, while the round report's wording is what the arena asserts.)
  for (let depth = 0; depth < 5; depth += 1) {
    if ((await page.getByText(/Use: Healing Herbs/).count()) > 0) break;
    const older = page.getByRole('link', { name: 'Older entries' });
    if ((await older.count()) === 0) break;
    await older.click();
  }
  await expect(page.getByText(/Use: Healing Herbs/).first()).toBeVisible();
});

test('no-JavaScript: a legacy active one-Enemy Combat save opens and plays a Round', async ({
  page,
}) => {
  await page.goto('/test-tactical');
  await page.getByRole('button', { name: 'Load legacy Combat save' }).click();
  await expect(page).toHaveURL(/\/play\/[^/]+$/);

  // Migration ran on read: the migrated Round 2 arena renders server-side,
  // with the wolf's committed Intent visible.
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expectRound(page, 2);
  await expect(page.locator('.tactical-intent')).toHaveCount(1);

  // One legal Round through the Attack form: no picker with a lone survivor.
  await expect(page.getByLabel('Target', { exact: true })).toHaveCount(0);
  await submitCombat(page, /Attack/);
  await expectRound(page, 3);
  // The Round resolved exactly once: a single last-round callout on the page,
  // with the legacy rows kept below it (no duplicate Damage from writeback).
  await expect(page.getByText(/Last round/)).toHaveCount(1);
  expect((await laneHealth(page, 0)).trim()).toMatch(/\d+\/\d+/);
  // The migrated Journal survived the new Round verbatim: the captured intro
  // row ("Rain has followed you for three days…") is still on the journal
  // pages, newest-first with no-JS "Older entries" paging.
  await page.getByRole('link', { name: /Journal, \d+ entr/ }).click();
  await expect(page).toHaveURL(/\/journal/);
  for (let depth = 0; depth < 3; depth += 1) {
    if ((await page.getByText(/Rain has followed you/).count()) > 0) break;
    const older = page.getByRole('link', { name: 'Older entries' });
    if ((await older.count()) === 0) break;
    await older.click();
  }
  await expect(page.getByText(/Rain has followed you/).first()).toBeVisible();
});
