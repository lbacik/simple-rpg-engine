import { expect, test } from '@playwright/test';

// The Arena custom Character (issue #168): the setup offers Attribute (0–3)
// and Health (1–12) controls with a Template preset selector, and a fight
// started from custom values behaves by the rules — here the starting Health
// shows in the Combat panel and a Round resolves.

test('arena: a preset fills the controls, edits stick, the custom fight works', async ({
  page,
}) => {
  await page.goto('/arena');
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();

  const might = page.getByLabel('Might');
  const agility = page.getByLabel('Agility');
  const wits = page.getByLabel('Wits');
  const presence = page.getByLabel('Presence');
  const health = page.getByLabel(/Starting Health/);
  const preset = page.getByLabel('Character preset');

  // The default Character ships in the controls.
  await expect(might).toHaveValue('2');
  await expect(agility).toHaveValue('2');
  await expect(wits).toHaveValue('1');
  await expect(presence).toHaveValue('1');
  await expect(health).toHaveValue('12');

  // A shipped Template preset fills the controls: the whispering-woods
  // Hunter is Might 1, Agility 3, Wits 2, Presence 0 at full Health.
  await preset.selectOption('whispering-woods/hunter');
  await expect(might).toHaveValue('1');
  await expect(agility).toHaveValue('3');
  await expect(wits).toHaveValue('2');
  await expect(presence).toHaveValue('0');
  await expect(health).toHaveValue('12');

  // Values stay editable after the preset: drop to all 0 at Health 5, which
  // marks the setup Custom again.
  await might.fill('0');
  await agility.fill('0');
  await wits.fill('0');
  await presence.fill('0');
  await health.fill('5');
  await expect(preset).toHaveValue('');

  await page.getByRole('button', { name: 'Start the fight' }).click();
  await expect(page.getByLabel('Combat arena')).toBeVisible();

  // The custom starting Health reaches the Combat panel below the maximum.
  await expect(page.locator('.tactical-side .combat-health')).toContainText('5/12');

  // A Round with the extreme Character resolves by the rules.
  await page.getByRole('button', { name: /^Attack/ }).click();
  await expect(page.locator('.combat-header .combat-kicker').first()).toContainText('Round 2');
});

test('arena: out-of-range values never start a fight', async ({ page }) => {
  await page.goto('/arena');
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();

  // Client validation blocks the submit: no fight starts, the setup stays.
  await page.getByLabel(/Starting Health/).fill('99');
  await page.getByRole('button', { name: 'Start the fight' }).click();
  await expect(page.getByLabel('Combat arena')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
});

test('arena: the custom setup reads Polish under pl', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'pl-PL' });
  const page = await context.newPage();
  try {
    await page.goto('/arena');
    await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
    await expect(page.getByLabel('Gotowy wzorzec postaci')).toBeVisible();
    await expect(page.getByLabel('Krzepa')).toHaveValue('2');
    await expect(page.getByLabel(/Zdrowie początkowe/)).toHaveValue('12');

    await page.getByLabel('Gotowy wzorzec postaci').selectOption('whispering-woods/hunter');
    await expect(page.getByLabel('Zręczność')).toHaveValue('3');

    await page.getByRole('button', { name: 'Rozpocznij walkę' }).click();
    await expect(page.getByLabel('Arena walki')).toBeVisible();
  } finally {
    await context.close();
  }
});
