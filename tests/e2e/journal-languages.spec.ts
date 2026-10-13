import { expect, test } from '@playwright/test';

// The Journal across Interface Languages (docs/spec/playthrough-state.md,
// journal; docs/spec/ui.md, journal; ADR 0004): entries record the language
// of the Scenario text actually shown, so a player who switches language
// mid-Playthrough keeps every earlier narration in the language it was
// presented in, visibly marked with its flag, while all Interface Text follows
// the new Interface Language. A result panel shown again after the switch
// keeps its narration and re-renders its state changes. The suite plays
// two-bridges in English, chooses without a Test (deterministic), then
// switches to Polish.
//
// The suite runs against the temporary Scenario directory (see
// playwright.config.ts) holding the shipped Scenarios and both Translation
// fixtures. The language shown is asserted through `lang` attributes; visible
// text is written out in the test.

test('a mid-playthrough switch keeps earlier narration with flags, in Polish UI', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Two Bridges' })
    .getByRole('link', { name: 'New Playthrough' })
    .click();
  await page.locator('#name').fill('E2E');
  await page.getByRole('button', { name: 'Start the Playthrough' }).click();
  await expect(page).toHaveURL(/\/play\/[^/]+$/);

  // The intro is a result panel; Continue reaches the on-enter Scene.
  await page.getByRole('link', { name: 'Continue' }).click();
  const title = page.locator('article.reading h1');
  await expect(title.locator('span[lang="en"]')).toHaveText('The Near Bridge');

  // A Choice without a Test: deterministic, one step with Choice, Outcome,
  // state change and the follow-on Scene entries, all presented in English.
  await page.getByRole('button', { name: 'Ask what key he means.' }).click();
  const panel = page.locator('article.reading');
  await expect(panel).toContainText('The brass key, lost on the far side');
  await expect(panel).toContainText('Received: Brass Key');

  // Switching refreshes the page in Polish with the same result panel: its
  // narration stays in the presented English, its state change follows Polish.
  await page.locator('details.langmenu > summary').click();
  await page.locator('details.langmenu button[value="pl"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(panel.locator('div[lang="en"]')).toContainText(
    'The brass key, lost on the far side',
  );
  await expect(panel).toContainText('Otrzymano: Brass Key');
  await expect(panel.locator('span[lang="en"]')).toHaveText('Brass Key');

  // Continue reaches the follow-on Scene, now shown in Polish.
  await page.getByRole('link', { name: 'Kontynuuj' }).click();
  await expect(title.locator('span[lang="pl"]')).toHaveText('Cena przewoźnika');

  // The Journal holds six entries, all presented in English: each narration
  // entry carries its language with a flag after its Polish type label, while
  // the engine-generated state change carries no flag and only its name keeps
  // the presented language.
  await page.locator('#launcher-journal').click();
  await expect(page).toHaveURL(/\/play\/[^/]+\/journal$/);
  const list = page.locator('ol');
  await expect(list.locator('li')).toHaveCount(6);

  const intro = list.locator('li', { hasText: 'Rain has swollen the river' });
  await expect(intro.locator('.meta')).toContainText('Wstęp');
  await expect(intro.getByRole('img', { name: 'Angielski' })).toBeVisible();
  await expect(intro.locator('div[lang="en"]')).toContainText('Rain has swollen the river');

  const arrival = list.locator('li', { hasText: 'blocks the planks' });
  await expect(arrival.locator('.meta')).toContainText('Scena');
  await expect(arrival.getByRole('img', { name: 'Angielski' })).toBeVisible();

  const choice = list.locator('li', { hasText: 'Ask what key he means.' });
  await expect(choice.locator('.meta')).toContainText('Dokonany wybór');
  await expect(choice.getByRole('img', { name: 'Angielski' })).toBeVisible();
  await expect(choice.locator('div[lang="en"]')).toContainText('Ask what key he means.');

  const outcome = list.locator('li', { hasText: 'lost on the far side' });
  await expect(outcome.locator('.meta')).toContainText('Wynik');
  await expect(outcome.getByRole('img', { name: 'Angielski' })).toBeVisible();

  const change = list.locator('li', { hasText: 'Otrzymano:' });
  await expect(change.locator('.meta')).toContainText('Zmiana stanu');
  await expect(change.getByRole('img')).toHaveCount(0);
  await expect(change.locator('span[lang="en"]')).toHaveText('Brass Key');

  const ferry = list.locator('li', { hasText: 'smells of tar' });
  await expect(ferry.locator('.meta')).toContainText('Scena');
  await expect(ferry.getByRole('img', { name: 'Angielski' })).toBeVisible();
  await expect(ferry.locator('div[lang="en"]')).toContainText('The far bank smells of tar');
});
