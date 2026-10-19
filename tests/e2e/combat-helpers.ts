import { expect, type Page } from '@playwright/test';

// Shared Combat MVP 1.0 E2E helpers (P7b): drive the shared command panel in
// both modes through its accessible surface only — stance/card/target links,
// the "Play round" POST and the hidden round marker. No catalogue imports:
// every visible string is written out, so a wording change fails loudly here
// instead of silently following the catalogue.

/** The hidden round marker inside the Confirm POST form. */
export function roundInput(page: Page) {
  return page.locator('form[action$="confirm"] input[name="round"]');
}

/** The current Combat round, read from the Confirm form (present mid-fight). */
export async function roundNumber(page: Page): Promise<number> {
  return Number(await roundInput(page).inputValue());
}

/** The per-round Combat log groups ("Round N"). */
export function logRounds(page: Page) {
  return page.locator('section[aria-label="Combat log"] section[aria-label^="Round "]');
}

/** The "After the round" forecast list, for cross-tab state comparison. */
export function afterRoundList(page: Page) {
  return page.locator('ul[aria-label="After the round"]');
}

export interface RoundSelection {
  stance: RegExp;
  card: RegExp;
  target: RegExp;
}

/**
 * Select stance, card and target and submit the Confirm POST, without
 * asserting what renders next. Use it for a Round that ends the fight;
 * use playRound when another Round must open.
 */
export async function submitSelection(page: Page, selection: RoundSelection): Promise<void> {
  await page.getByRole('link', { name: selection.stance }).first().click();
  await page.getByRole('link', { name: selection.card }).first().click();
  await page.getByRole('link', { name: selection.target }).first().click();
  await expect(page.getByRole('button', { name: 'Play round' })).toBeEnabled();
  await page.getByRole('button', { name: 'Play round' }).click();
}

/**
 * Play one Round through the command panel: pick stance, card and target,
 * then submit the Confirm POST. Works with and without JavaScript (without
 * it every selection is a full navigation; the locators re-resolve).
 */
export async function playRound(page: Page, selection: RoundSelection): Promise<void> {
  const next = (await roundNumber(page)) + 1;
  await submitSelection(page, selection);
  await expect(roundInput(page)).toHaveValue(String(next));
  await expect(page).not.toHaveURL(/notice=/);
}

/** Start a T1–T7 preset fight, ticking the replace confirmation when mid-fight. */
export async function startArenaPreset(page: Page, id: string): Promise<void> {
  const form = page.locator('form[action="/arena/start"]', {
    has: page.getByRole('button', { name: `Start ${id}` }),
  });
  const confirm = form.locator('input[name="confirm"]');
  if ((await confirm.count()) > 0) await confirm.check();
  await form.getByRole('button', { name: `Start ${id}` }).click();
  await expect(page.getByLabel('Round forecast')).toBeVisible();
  await expect(page).not.toHaveURL(/notice=/);
}
/** The stored Journal size from the side-panel launcher. */
export async function journalEntryCount(page: Page): Promise<number> {
  const text =
    (await page.getByRole('link', { name: /Journal, \d+ entr/ }).textContent()) ?? '';
  const match = /Journal\D*(\d+)/.exec(text);
  if (match === null) throw new Error(`no journal count in launcher: ${text}`);
  return Number(match[1]);
}

/** Start a whispering-woods Playthrough with the given hero name. */
export async function startWhisperingPlaythrough(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'The Whispering Woods' })
    .getByRole('link', { name: 'New Playthrough' })
    .click();
  await page.locator('#name').fill(name);
  await page.getByRole('button', { name: 'Start the Playthrough' }).click();
  await expect(page).toHaveURL(/\/play\/[^/]+$/);
}

/**
 * Walk a fresh Playthrough to the Hunters' Camp bandit fight
 * (camp-bandit, a lone Bandit Archer starting Far). Handles the intro and
 * outcome modals on the way; ends with the command panel visible.
 */
export async function reachCampBandit(page: Page): Promise<void> {
  await expect(page.getByRole('dialog', { name: 'Intro' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'The Bell of Ashford' })).toBeVisible();

  await page.getByRole('button', { name: 'Hear her out.' }).click();
  await expect(page.getByRole('heading', { name: "Brenna's Plea" })).toBeVisible();

  await page.getByRole('button', { name: 'Promise to find Mira.' }).click();
  const outcome = page.getByRole('dialog', { name: 'Latest events' });
  await expect(outcome).toBeVisible();
  await outcome.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Ashford' })).toBeVisible();

  await page.getByRole('button', { name: 'Take the cart track towards the woods' }).click();
  await expect(page.getByRole('heading', { name: 'The Whispering Trees' })).toBeVisible();
  await page.getByRole('button', { name: 'Ignore the voices and press on.' }).click();
  await expect(page.getByRole('heading', { name: 'Forest Edge' })).toBeVisible();

  await page.getByRole('button', { name: 'Follow the trampled trail north' }).click();
  await expect(page.getByRole('heading', { name: 'An Arrow at the Ready' })).toBeVisible();
  await page.getByRole('button', { name: 'Draw your weapon.' }).click();
  await expect(page.getByLabel('Round forecast')).toBeVisible();
  await expect(roundInput(page)).toHaveValue('1');
}

/** The camp-bandit winning line at full entry Health (deterministic core). */
export const CAMP_BANDIT_WIN_LINE: RoundSelection[] = [
  { stance: /Aggressive/, card: /^Brace/, target: /^self/ },
  { stance: /Aggressive/, card: /^Brace/, target: /^self/ },
  { stance: /Aggressive/, card: /^Approach/, target: /e01/ },
  { stance: /Aggressive/, card: /^Charge/, target: /e01/ },
  { stance: /Aggressive/, card: /^Heavy blow/, target: /e01/ },
];

/** Four unguarded Rounds against the Bandit Archer: LOSS in round 4. */
export const CAMP_BANDIT_LOSE_LINE: RoundSelection[] = [
  { stance: /Aggressive/, card: /^Prepare/, target: /^self/ },
  { stance: /Aggressive/, card: /^Prepare/, target: /^self/ },
  { stance: /Aggressive/, card: /^Prepare/, target: /^self/ },
  { stance: /Aggressive/, card: /^Prepare/, target: /^self/ },
];

/** The T1 duel winning line from rules §11.1: WIN in round 3. */
export const T1_WIN_LINE: RoundSelection[] = [
  { stance: /Defensive/, card: /^Counter/, target: /^self/ },
  { stance: /Balanced/, card: /^Feint/, target: /e01/ },
  { stance: /Aggressive/, card: /^Heavy blow/, target: /e01/ },
];
