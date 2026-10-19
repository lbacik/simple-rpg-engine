import { promises as fs } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import {
  startArenaPreset,
  submitArenaImport,
  submitSelection,
  T1_WIN_LINE,
  logGroups,
  logRound,
  playRound,
  roundInput,
} from './combat-helpers';

// The Arena page (Combat MVP 1.0, P5): a full Arena on the shared Combat
// core. Setup configures 1–5 opponents in explicit order with an optional
// Companion (or a T1–T7 preset); the fight runs Round by Round in the command
// panel and persists per Session, so a reload resumes the same fight.

test('arena: the setup form and presets render with no fight', async ({ page }) => {
  // The Arena entry sits in the top navigation, reachable from the collection.
  await page.goto('/');
  await page.locator('header.topnav').getByRole('link', { name: 'Arena' }).click();
  await expect(page).toHaveURL(/\/arena$/);
  await expect(page.getByRole('heading', { name: 'Arena' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'New fight' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start the fight' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reference scenarios' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start T1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start T7' })).toBeVisible();
  // No fight yet, so there is nothing to restart.
  await expect(page.getByRole('heading', { name: 'Restart' })).toHaveCount(0);
});

test('arena: a T1 preset fight starts and survives a reload', async ({ page }) => {
  await page.goto('/arena');
  await page.getByRole('button', { name: 'Start T1' }).click();
  // The command panel renders the Round 1 forecast, and a Setup-started
  // mid-fight offers Restart behind its in-page confirmation.
  await expect(page.getByLabel('Round forecast')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Restart' })).toBeVisible();
  // A reload resumes the same fight, not the Setup form alone.
  await page.reload();
  await expect(page.getByLabel('Round forecast')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Restart' })).toBeVisible();
});

test('arena: a custom setup starts a fight and plays a round', async ({ page }) => {
  await page.goto('/arena');
  // The custom form with its defaults (one engaged Brute, no Companion):
  // this proves the Setup path itself opens a real fight, not just presets.
  await page.getByRole('button', { name: 'Start the fight', exact: true }).click();
  await expect(page.getByLabel('Round forecast')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Restart' })).toBeVisible();

  // Defensive Counter on self is legal against any opening; round 2 opens.
  await playRound(page, T1_WIN_LINE[0]);
});

test('arena: a whole T1 fight plays to Victory, then Fight again starts fresh', async ({
  page,
}) => {
  await page.goto('/arena');
  await startArenaPreset(page, 'T1');

  // The §11.1 duel line: Counter, Feint, Heavy blow. WIN in round 3 with the
  // hero at 30 HP (the K8 golden test asserts the same through the core).
  // The last Round ends the fight instead of opening a new one.
  await playRound(page, T1_WIN_LINE[0]);
  await playRound(page, T1_WIN_LINE[1]);
  await submitSelection(page, T1_WIN_LINE[2]);
  await expect(page).not.toHaveURL(/notice=/);

  await expect(page.getByRole('heading', { name: 'Fight over' })).toBeVisible();
  await expect(page.getByText('Victory', { exact: true })).toBeVisible();
  await expect(logRound(page, 3)).toBeVisible();
  // A finished fight logs exactly its resolved Rounds (no next-Round plans).
  await expect(logGroups(page)).toHaveCount(3);
  // No Restart on a finished fight: only Fight again remains.
  await expect(page.getByRole('heading', { name: 'Restart' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fight again' })).toBeVisible();

  await page.getByRole('button', { name: 'Fight again' }).click();
  await expect(page.getByLabel('Round forecast')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fight over' })).toHaveCount(0);
  await expect(roundInput(page)).toHaveValue('1');
  // A fresh fight already logs its Round 1 declarations.
  await expect(logRound(page, 1)).toBeVisible();
  await expect(logGroups(page)).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Restart' })).toBeVisible();
});

test('arena: export downloads the fight, import takes paste and file', async ({
  page,
}) => {
  await page.goto('/arena');
  await startArenaPreset(page, 'T1');
  await playRound(page, T1_WIN_LINE[0]);

  // Export the mid-fight state (round 2) through the download.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export the current fight' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('combat-r02-CHOOSE.json');
  const exportedPath = await download.path();
  expect(exportedPath).not.toBeNull();
  const exported = JSON.parse(await fs.readFile(exportedPath as string, 'utf8')) as {
    rulesVersion: string;
    round: number;
  };
  expect(exported.rulesVersion).toBe('simple-rpg-engine-stance-cards-1.0');
  expect(exported.round).toBe(2);

  // Replace the fight with a paste of the export: the same round resumes and
  // the history is marked not verified.
  await startArenaPreset(page, 'T7');
  await expect(roundInput(page)).toHaveValue('1');
  await page.locator('#arena-import-pasted').fill(JSON.stringify(exported));
  await submitArenaImport(page);
  await expect(page).not.toHaveURL(/notice=/);
  await expect(roundInput(page)).toHaveValue('2');
  await expect(page.getByText('Imported history is not verified.')).toBeVisible();

  // The same document imports from a file upload.
  await startArenaPreset(page, 'T7');
  await expect(roundInput(page)).toHaveValue('1');
  await page.locator('#arena-import-file').setInputFiles({
    name: 'combat-r02-CHOOSE.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await submitArenaImport(page);
  await expect(page).not.toHaveURL(/notice=/);
  await expect(roundInput(page)).toHaveValue('2');

  // Garbage pastes explain themselves and change nothing.
  await page.locator('#arena-import-pasted').fill('this is not a fight');
  await submitArenaImport(page);
  await expect(page).toHaveURL(/notice=rejected/);
  await expect(page.getByRole('status').filter({ hasText: 'Command rejected' })).toBeVisible();
  await expect(roundInput(page)).toHaveValue('2');
});

/** Tab through the page until the focused element's name matches, then stop. */
async function tabUntil(page: Page, pattern: RegExp, max = 200): Promise<void> {
  for (let i = 0; i < max; i += 1) {
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null) return '';
      return (el.getAttribute('aria-label') ?? el.textContent ?? '')
        .trim()
        .replace(/\s+/g, ' ');
    });
    if (pattern.test(focused)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`keyboard-only play never focused ${String(pattern)}`);
}

test('arena: one Round plays keyboard-only, with no pointer input', async ({ page }) => {
  await page.goto('/arena');
  // The preset button is a form submit, reachable keyboard-only.
  await tabUntil(page, /^Start T1$/);
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Round forecast')).toBeVisible();

  // T1 round 1: Defensive, Counter, self — every step by Tab and Enter only.
  await tabUntil(page, /Defensive/);
  await page.keyboard.press('Enter');
  await tabUntil(page, /^Counter/);
  await page.keyboard.press('Enter');
  await tabUntil(page, /^self/);
  await page.keyboard.press('Enter');
  await tabUntil(page, /^Play round$/);
  await page.keyboard.press('Enter');

  await expect(roundInput(page)).toHaveValue('2');
  await expect(page).not.toHaveURL(/notice=/);
  // Round 1 resolved, with the frozen Round 2 declarations already logged.
  await expect(logRound(page, 1)).toBeVisible();
  await expect(logGroups(page)).toHaveCount(2);
});
