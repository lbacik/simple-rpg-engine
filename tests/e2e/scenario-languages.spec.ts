import { expect, test } from '@playwright/test';

// Scenario Translations end to end (docs/spec/architecture.md, testing
// strategy; docs/spec/ui.md, collection, character creation, scenario language
// flags, language fallback on the game screen): the suite runs against a
// temporary Scenario directory (see playwright.config.ts) holding the shipped
// Scenarios and both Translation fixtures, with stara-studnia carrying no
// `en` Translation so it falls back to its Polish base under `en`. The
// collection groups and flags are covered in both languages, stara-studnia
// falls back to Polish under `en` with the badge, two-bridges is shown in
// Polish under `pl`, and a mid-Playthrough switch refreshes the Scenario text
// with no notice. The language shown is asserted through `lang` attributes;
// visible text is written out in the test.

const BASE_URL = `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 3100)}`;

test('the collection groups and flags under en', async ({ page }) => {
  await page.goto('/');

  const here = page.getByRole('region', { name: 'In English' });
  await expect(here.locator('li h2')).toHaveText([
    'The Drowned Ledger',
    'Two Bridges',
    'The Whispering Woods',
  ]);
  for (const title of ['The Drowned Ledger', 'Two Bridges', 'The Whispering Woods']) {
    await expect(here.locator('li', { hasText: title }).locator('h2')).toHaveAttribute(
      'lang',
      'en',
    );
  }

  // Two Bridges lists its Base Language first, ringed, and the Translation dimmed.
  const bridges = here.locator('li', { hasText: 'Two Bridges' });
  await expect(bridges.getByRole('img', { name: 'English (original)' })).toHaveClass(
    /flag current/,
  );
  await expect(bridges.getByRole('img', { name: 'Polish' })).not.toHaveClass(/current/);
  await expect(bridges.locator('.flags [role="img"]').first()).toHaveAttribute(
    'aria-label',
    'English (original)',
  );

  const other = page.getByRole('region', { name: 'In other languages' });
  await expect(other).toContainText(
    'These Scenarios are not translated into English yet. You play them in their original language.',
  );
  await expect(other.locator('li h2')).toHaveText(['Stara studnia']);
  const well = other.locator('li', { hasText: 'Stara studnia' });
  await expect(well.locator('h2')).toHaveAttribute('lang', 'pl');
  // Without its `en` Translation the Scenario lists only its Base Language, ringed.
  await expect(well.getByRole('img', { name: 'Polish (original)' })).toHaveClass(
    /flag current/,
  );
  await expect(well.locator('.flags [role="img"]')).toHaveCount(1);
});

test('the collection groups and flags under pl', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'pl-PL' });
  const page = await context.newPage();
  try {
    await page.goto('/');

    const here = page.getByRole('region', { name: 'Po polsku' });
    await expect(here.locator('li h2')).toHaveText(['Stara studnia', 'Dwa mosty']);
    await expect(here.locator('li', { hasText: 'Dwa mosty' }).locator('h2')).toHaveAttribute(
      'lang',
      'pl',
    );

    // Dwa mosty: the English Base Language dimmed, the Polish Translation ringed.
    const bridges = here.locator('li', { hasText: 'Dwa mosty' });
    await expect(bridges.getByRole('img', { name: 'Angielski (oryginał)' })).not.toHaveClass(
      /current/,
    );
    await expect(bridges.getByRole('img', { name: 'Polski' })).toHaveClass(/flag current/);
    await expect(bridges.locator('.flags [role="img"]').first()).toHaveAttribute(
      'aria-label',
      'Angielski (oryginał)',
    );

    const other = page.getByRole('region', { name: 'W innych językach' });
    await expect(other).toContainText(
      'Te scenariusze nie mają jeszcze tłumaczenia na język polski. Grasz w nie w oryginale.',
    );
    await expect(other.locator('li h2')).toHaveText([
      'The Drowned Ledger',
      'The Whispering Woods',
    ]);
    await expect(
      other.locator('li', { hasText: 'The Whispering Woods' }).locator('h2'),
    ).toHaveAttribute('lang', 'en');
  } finally {
    await context.close();
  }
});

test('stara-studnia falls back to Polish under en, with the badge', async ({ page }) => {
  await page.goto('/');

  // Character creation names the fallback after the flags.
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Stara studnia' })
    .getByRole('link', { name: 'New Playthrough' })
    .click();
  await expect(page).toHaveTitle('New Playthrough: Stara studnia');
  await expect(page.getByRole('heading', { name: 'Stara studnia' })).toHaveAttribute(
    'lang',
    'pl',
  );
  await expect(page.locator('main > p.meta')).toContainText(
    'Not translated into English. Shown in Polish.',
  );
  await expect(
    page.getByRole('heading', { name: 'Wędrowiec' }),
  ).toHaveAttribute('lang', 'pl');

  // The game screen carries the badge after the Scene title: the on-enter
  // Scene fires at the start Location.
  await page.locator('#name').fill('E2E');
  await page.getByRole('button', { name: 'Start the Playthrough' }).click();
  await expect(page).toHaveURL(/\/play\/[^/]+$/);
  const title = page.locator('article.reading h1');
  await expect(title.locator('span[lang="pl"]')).toHaveText('Głos ze studni');
  const badge = title.locator('.lang-chip');
  await expect(badge).toContainText('Text: Polish');
  await expect(badge.getByRole('img', { name: 'Polish (original)' })).toBeVisible();
});

test('two-bridges is shown in Polish under pl, with no badge', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'pl-PL' });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page
      .getByRole('listitem')
      .filter({ hasText: 'Dwa mosty' })
      .getByRole('link', { name: 'Nowa rozgrywka' })
      .click();
    await expect(page).toHaveTitle('Nowa rozgrywka: Dwa mosty');
    await expect(page.getByRole('heading', { name: 'Dwa mosty' })).toHaveAttribute(
      'lang',
      'pl',
    );
    await expect(page.locator('main > p.meta')).not.toContainText('Brak tłumaczenia');
    await expect(page.getByRole('heading', { name: 'Wędrowiec' })).toHaveAttribute(
      'lang',
      'pl',
    );
    await expect(page.getByRole('heading', { name: 'Pielgrzym' })).toHaveAttribute(
      'lang',
      'pl',
    );

    await page.locator('#name').fill('E2E');
    await page.getByRole('button', { name: 'Rozpocznij rozgrywkę' }).click();
    await expect(page).toHaveURL(/\/play\/[^/]+$/);
    // The intro is a result panel; Continue reaches the translated on-enter Scene.
    await page.getByRole('link', { name: 'Kontynuuj' }).click();
    const title = page.locator('article.reading h1');
    await expect(title.locator('span[lang="pl"]')).toHaveText('Bliski most');
    await expect(title.locator('.lang-chip')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('switching mid-Playthrough refreshes the Scenario text with no notice', async ({
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
  await page.getByRole('link', { name: 'Continue' }).click();

  const title = page.locator('article.reading h1');
  await expect(title.locator('span[lang="en"]')).toHaveText('The Near Bridge');
  await expect(title.locator('.lang-chip')).toHaveCount(0);

  await page.locator('details.langmenu > summary').click();
  await page.locator('details.langmenu button[value="pl"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  // The same position in the newly selected Translation, badge-free, and the
  // switch itself leaves no notice behind.
  await expect(title.locator('span[lang="pl"]')).toHaveText('Bliski most');
  await expect(title.locator('.lang-chip')).toHaveCount(0);
  await expect(page.locator('article.reading .notice')).toHaveCount(0);
});
