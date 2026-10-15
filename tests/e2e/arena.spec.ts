import { expect, test, type Page } from '@playwright/test';

// The Arena end to end (top navigation, Bestiary setup, Combat through the
// existing Combat panel, reload resume, result screen, back to the setup):
// pick the Training Dummy, fight a few Rounds through the Attack form,
// reload mid-fight and see the same Combat, then fight on to the victory
// result screen and back to the setup. Every step works through links and
// plain forms, like the no-JavaScript tactical flow.

async function expectRound(page: Page, expected: number) {
  await expect(page.locator('.combat-header .combat-kicker').first()).toContainText(
    `Round ${expected}`,
  );
}

test('arena: setup, a few rounds, reload resume, victory, back to setup', async ({
  page,
}) => {
  // The Arena entry lives in the top navigation, reachable from every screen.
  await page.goto('/');
  await page.getByRole('link', { name: 'Arena' }).first().click();
  await expect(page).toHaveURL('/arena');
  await page.goto('/playthroughs');
  await expect(page.getByRole('link', { name: 'Arena' }).first()).toBeVisible();
  await page.goto('/arena');

  // The setup: the Bestiary names its foes and the default fighter is kept.
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bestiary' })).toBeVisible();
  await expect(page.getByText('Training Dummy')).toBeVisible();
  await expect(page.getByText('Pit Wolf')).toBeVisible();
  await expect(page.getByText('Cave Bear')).toBeVisible();
  await expect(page.getByText('Arena Fighter')).toBeVisible();

  // The dummy is the default pick: Start lands in its Combat at round 1.
  await page.getByRole('button', { name: 'Start the fight' }).click();
  await expect(page).toHaveURL(/\/arena\?fight=/);
  const fightUrl = page.url();
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expectRound(page, 1);

  // One legal Round through the Attack form: the kicker advances.
  await page.getByRole('button', { name: /Attack/ }).click();
  await expectRound(page, 2);

  // Reloading mid-fight resumes the same Combat, not a fresh one.
  await page.reload();
  await expect(page.getByLabel('Combat arena')).toBeVisible();
  await expectRound(page, 2);

  // Fight on to the result screen. The dummy cannot fell 12 Health before
  // two sword hits land, so the screen is the victory Ending; every attempt
  // is a legal Round either way. Each attempt resolves exactly one Round (or
  // ends the fight), so wait for the kicker to move on or the result screen
  // before the next attempt.
  const kicker = page.locator('.combat-header .combat-kicker').first();
  const backToArena = page.getByRole('link', { name: 'Back to the Arena' });
  for (let round = 0; round < 15; round += 1) {
    if ((await backToArena.count()) > 0) break;
    const before = ((await kicker.textContent()) ?? '').trim();
    await page.getByRole('button', { name: /Attack/ }).click();
    await expect
      .poll(async () => {
        if ((await backToArena.count()) > 0) return 'done';
        if ((await page.getByLabel('Combat arena').count()) === 0) return 'waiting';
        return ((await kicker.textContent()) ?? 'waiting').trim();
      })
      .not.toBe(before);
  }
  await expect(page.getByRole('heading', { name: 'Champion of the Sands' })).toBeVisible();
  await expect(page.getByText('Victory')).toBeVisible();

  // Back to the setup, and the fight URL still shows the same result.
  await page.getByRole('link', { name: 'Back to the Arena' }).click();
  await expect(page).toHaveURL('/arena');
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
  await page.goto(fightUrl);
  await expect(page.getByRole('heading', { name: 'Champion of the Sands' })).toBeVisible();
});

test('arena setup reads Polish under pl', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'pl-PL' });
  const page = await context.newPage();
  try {
    await page.goto('/arena');
    await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bestiariusz' })).toBeVisible();
    await expect(
      page.getByText('Wybierz przeciwnika z Bestiariusza i stocz walkę.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rozpocznij walkę' })).toBeVisible();

    // Starting works the same: the fight opens at round 1, in Polish chrome.
    await page.getByRole('button', { name: 'Rozpocznij walkę' }).click();
    await expect(page).toHaveURL(/\/arena\?fight=/);
    await expect(page.locator('.combat-header .combat-kicker').first()).toContainText(
      'Runda 1',
    );
  } finally {
    await context.close();
  }
});
