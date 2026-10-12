import { expect, test } from '@playwright/test';

// The Interface Language end to end (docs/spec/architecture.md, testing
// strategy): a first visit negotiates from Accept-Language, a switch in the
// language menu survives a reload, and a switch works with JavaScript
// disabled. The language shown is asserted through `<html lang>`.

const BASE_URL = `http://127.0.0.1:${Number(process.env.E2E_PORT ?? 3100)}`;

test('a first visit with Accept-Language pl-PL is in Polish', async ({ browser }) => {
  // `locale` drives the Accept-Language header the browser sends.
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'pl-PL' });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    await expect(
      page.locator('header.topnav').getByRole('link', { name: 'Scenariusze' }),
    ).toBeVisible();
    await expect(page.locator('summary[aria-label="Język: Polski"]')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('a switch in the language menu survives a reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('summary[aria-label="Language: English"]')).toBeVisible();

  await page.locator('details.langmenu > summary').click();
  await page.locator('details.langmenu button[value="pl"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(
    page.locator('header.topnav').getByRole('link', { name: 'Scenariusze' }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');

  // The menu lists both languages with their `lang` and a check mark on the
  // current one.
  await page.locator('details.langmenu > summary').click();
  await expect(page.locator('details.langmenu button[value="pl"][lang="pl"]')).toContainText(
    '✓',
  );
  await expect(page.locator('details.langmenu button[value="en"][lang="en"]')).not.toContainText(
    '✓',
  );
});

test('the collection and character creation are in Polish', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'pl-PL' });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    await expect(page).toHaveTitle('Scenariusze');
    await expect(page.getByRole('heading', { name: 'Scenariusze' })).toBeVisible();

    await page
      .getByRole('listitem')
      .filter({ hasText: 'The Whispering Woods' })
      .getByRole('link', { name: 'Nowa rozgrywka' })
      .click();
    await expect(page).toHaveTitle('Nowa rozgrywka: The Whispering Woods');
    await expect(page.getByRole('heading', { name: 'The Whispering Woods' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Szablony postaci' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rozpocznij' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rozpocznij rozgrywkę' })).toBeVisible();
    // Scenario text is unchanged: the English description keeps its `lang`.
    await expect(page.locator('main > p[lang="en"]')).toBeVisible();
  } finally {
    await context.close();
  }
});

test('the not-found page is in the Interface Language', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'pl-PL' });
  const page = await context.newPage();
  try {
    await page.goto('/no-such-page');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    await expect(page.getByRole('heading', { name: 'Nie znaleziono strony' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Wróć do scenariuszy' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('a switch works with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: BASE_URL, javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await page.locator('details.langmenu > summary').click();
    await page.locator('details.langmenu button[value="pl"]').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    await expect(
      page.locator('header.topnav').getByRole('link', { name: 'Scenariusze' }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});
