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
