// Combat catalogue slice (U1, ADR 0011): the Combat Interface Text shipped to
// the browser is typed and complete in English and Polish, and only that slice
// reaches client bundles. Missing keys fail typecheck through `CombatCatalogue`
// (pl is declared as one) and the KeysEqual guards in `combat-en.ts`; these
// tests prove EN/PL parity at runtime, that every core code renders, and that
// the slice's module closure stays client-safe while `use client` files never
// import the server-side catalogue.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COMBAT_EVENT_TYPES,
  COMBAT_RESULTS,
  PARSE_ISSUE_CODES,
  REASON_ORDER,
} from '../src/engine/combat/index';
import { combatEn, type BlowParams, type CombatCatalogue } from '../src/i18n/combat-en';
import { combatPl } from '../src/i18n/combat-pl';
import { getCombatCatalogue } from '../src/i18n/combat';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDir, '..');
const srcDir = path.join(repoRoot, 'src');

function leafKeys(value: unknown, prefix = ''): string[] {
  if (typeof value === 'function') return [prefix];
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafKeys(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

/** Every message renders to a non-empty string with no unfilled placeholder. */
function expectRendered(value: unknown): void {
  expect(typeof value).toBe('string');
  const text = value as string;
  expect(text.length).toBeGreaterThan(0);
  expect(text).not.toContain('undefined');
  expect(text).not.toContain('NaN');
  expect(text).not.toContain('{');
  expect(text).not.toContain('}');
}

const BLOW_HIT: BlowParams = {
  actor: 'h01',
  target: 'e01',
  recipient: 'e01',
  redirected: false,
  counter: false,
  range: 'melee',
  attackScore: 6,
  defenseScore: 4,
  hit: true,
  raw: 8,
  parry: 0,
  armor: 1,
  absorbed: 2,
  hpLoss: 5,
};

const BLOW_MISS_REDIRECT: BlowParams = {
  ...BLOW_HIT,
  hit: false,
  hpLoss: 0,
  redirected: true,
  recipient: 'c01',
  counter: true,
};

function renderAll(catalogue: CombatCatalogue): void {
  const { reasons, events, results, notices, parseIssues, importIssues, actions, stances, ranges } =
    catalogue;
  expectRendered(reasons.insufficient_stamina(1));
  expectRendered(reasons.insufficient_stamina(3));
  expectRendered(reasons.on_cooldown(4));
  for (const reason of [
    reasons.stance_disallows,
    reasons.no_shot_ability,
    reasons.not_engaged,
    reasons.must_disengage,
    reasons.actor_engaged,
    reasons.target_far,
    reasons.target_not_near,
    reasons.requires_near_ally,
    reasons.invalid_target,
    reasons.wrong_round,
    reasons.wrong_phase,
    reasons['in-combat'],
  ] as const) {
    expectRendered(reason);
  }

  expectRendered(
    events['round-planned']({
      actor: 'e01',
      action: 'strike',
      stance: 'balanced',
      attackSlot: true,
      wasCandidate: true,
      baseDamage: 7,
      priority: 2,
      target: 'h01',
    }),
  );
  expectRendered(
    events['round-planned']({
      actor: 'e02',
      action: 'wait',
      stance: 'defensive',
      attackSlot: false,
      wasCandidate: false,
      baseDamage: 0,
      priority: 0,
      target: null,
    }),
  );
  expectRendered(
    events.declared({
      actor: 'h01',
      action: 'heavy',
      stance: 'aggressive',
      cost: 4,
      preparedAccuracy: 0,
      preparedDamage: 0,
      target: 'e01',
    }),
  );
  expectRendered(
    events.declared({
      actor: 'h01',
      action: 'strike',
      stance: 'balanced',
      cost: 0,
      preparedAccuracy: 2,
      preparedDamage: 3,
      target: null,
    }),
  );
  expectRendered(
    events['effect-established']({
      actor: 'h01',
      action: 'cover',
      guard: 3,
      exposed: false,
      counter: false,
      ward: 'c01',
      readyRound: null,
    }),
  );
  expectRendered(
    events['effect-established']({
      actor: 'e01',
      action: 'heavy',
      guard: 0,
      exposed: true,
      counter: true,
      ward: null,
      readyRound: 4,
    }),
  );
  expectRendered(
    events.moved({ actor: 'h01', action: 'approach', target: 'e01', success: true, detail: 'ENGAGE' }),
  );
  expectRendered(
    events.moved({ actor: 'h01', action: 'withdraw', target: null, success: true, detail: 'g7' }),
  );
  expectRendered(
    events.moved({
      actor: 'h01',
      action: 'charge',
      target: 'e01',
      success: false,
      detail: 'target_far',
    }),
  );
  expectRendered(events.attack(BLOW_HIT));
  expectRendered(events.attack(BLOW_MISS_REDIRECT));
  expectRendered(events.riposte(BLOW_HIT));
  expectRendered(events.cancelled({ actor: 'e01', target: 'h01', reason: 'range_lost' }));
  expectRendered(events.cancelled({ actor: 'e01', target: null, reason: 'actor_or_target_dead' }));
  expectRendered(events.eliminated('e01'));
  expectRendered(events.regenerated({ actor: 'h01', gain: 2, stamina: 8 }));
  expectRendered(events['wait-age-updated']({ actor: 'e01', waitAge: 2 }));
  for (const result of COMBAT_RESULTS) {
    expectRendered(events.finished({ result, round: 3 }));
    expectRendered(results[result]);
  }

  expectRendered(notices.stale);
  expectRendered(notices.rejected('Disengage first'));
  expectRendered(notices.unreadable);
  expectRendered(notices.importUnverified);

  expectRendered(parseIssues.bad_rules_version('tactical-1'));
  expectRendered(parseIssues.duplicate_actor_id('e01'));
  expectRendered(parseIssues.bad_actor_id('x99'));
  expectRendered(parseIssues.unknown_profile({ id: 'e01', profileId: 'dragon' }));
  expectRendered(parseIssues.bad_team_role('e01'));
  expectRendered(parseIssues.bad_stance('h01'));
  expectRendered(parseIssues.bad_group_id('h01'));
  expectRendered(parseIssues.hp_out_of_range({ id: 'h01', max: 40 }));
  expectRendered(parseIssues.bad_stamina('h01'));
  expectRendered(parseIssues.bad_ready_round('h01'));
  expectRendered(parseIssues.bad_available_round('h01'));
  expectRendered(parseIssues.bad_power('e01'));
  expectRendered(parseIssues.bad_phase_offset('e01'));
  expectRendered(parseIssues.bad_wait_age('e01'));
  expectRendered(parseIssues.too_many_companions(2));
  expectRendered(parseIssues.bad_enemy_count(0));
  expectRendered(parseIssues.bad_ref('e01'));
  expectRendered(parseIssues.bad_profile_role('e01'));
  expectRendered(parseIssues.bad_engagement({ a: 'h01', b: 'e01', reason: 'allies' }));
  expectRendered(parseIssues.bad_frozen_plan('target'));
  for (const issue of [
    parseIssues.unexpected_state_version,
    parseIssues.bad_round,
    parseIssues.bad_phase,
    parseIssues.bad_result,
    parseIssues.finished_without_result,
    parseIssues.result_before_finish,
    parseIssues.bad_next_group_serial,
    parseIssues.bad_actors,
    parseIssues.missing_hero,
    parseIssues.no_living_hero,
    parseIssues.no_living_enemies,
    parseIssues.bad_state,
    parseIssues.bad_engagements,
    parseIssues.bad_frozen_plans,
    parseIssues.bad_log,
  ] as const) {
    expectRendered(issue);
  }

  for (const issue of Object.values(importIssues)) expectRendered(issue);
  for (const name of Object.values(actions)) expectRendered(name);
  for (const name of Object.values(stances)) expectRendered(name);
  for (const name of Object.values(ranges)) expectRendered(name);
}

describe('combat catalogue slice', () => {
  it('resolves per Interface Language', () => {
    expect(getCombatCatalogue('en')).toBe(combatEn);
    expect(getCombatCatalogue('pl')).toBe(combatPl);
    expect(combatEn.code).toBe('en');
    expect(combatPl.code).toBe('pl');
  });

  it('has the same key set in English and Polish', () => {
    expect(leafKeys(combatPl).sort()).toEqual(leafKeys(combatEn).sort());
  });

  it('covers every core reason code, event type, result and ParseIssue', () => {
    for (const code of REASON_ORDER) expect(combatEn.reasons[code]).toBeDefined();
    for (const code of REASON_ORDER) expect(combatPl.reasons[code]).toBeDefined();
    for (const type of COMBAT_EVENT_TYPES) expect(combatEn.events[type]).toBeDefined();
    for (const type of COMBAT_EVENT_TYPES) expect(combatPl.events[type]).toBeDefined();
    for (const result of COMBAT_RESULTS) expect(combatEn.results[result]).toBeDefined();
    for (const result of COMBAT_RESULTS) expect(combatPl.results[result]).toBeDefined();
    for (const code of PARSE_ISSUE_CODES) expect(combatEn.parseIssues[code]).toBeDefined();
    for (const code of PARSE_ISSUE_CODES) expect(combatPl.parseIssues[code]).toBeDefined();
    expect(Object.keys(combatEn.reasons).sort()).toEqual([...REASON_ORDER].sort());
    expect(Object.keys(combatEn.events).sort()).toEqual([...COMBAT_EVENT_TYPES].sort());
    expect(Object.keys(combatEn.results).sort()).toEqual([...COMBAT_RESULTS].sort());
    expect(Object.keys(combatEn.parseIssues).sort()).toEqual([...PARSE_ISSUE_CODES].sort());
  });

  it('renders every message in English', () => {
    renderAll(combatEn);
  });

  it('renders every message in Polish', () => {
    renderAll(combatPl);
  });
});

describe('combat slice client boundary', () => {
  /** Runtime (bundled) imports of a module: type-only imports are erased at build. */
  function runtimeImports(file: string): string[] {
    const source = fs.readFileSync(file, 'utf8');
    const withoutTypes = source
      .replace(/import\s+type[\s\S]*?from\s*['"][^'"]+['"]\s*;?/g, '')
      .replace(/export\s+type[\s\S]*?from\s*['"][^'"]+['"]\s*;?/g, '');
    const specifiers: string[] = [];
    const pattern = /(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(withoutTypes)) !== null) specifiers.push(match[1]);
    return specifiers;
  }

  function resolveSpecifier(fromFile: string, specifier: string): string | null {
    if (!specifier.startsWith('.')) return specifier;
    const base = path.resolve(path.dirname(fromFile), specifier);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
  }

  function transitiveClosure(entry: string): Set<string> {
    const seen = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const specifier of runtimeImports(file)) {
        const resolved = resolveSpecifier(file, specifier);
        if (resolved !== null && !seen.has(resolved)) queue.push(resolved);
      }
    }
    return seen;
  }

  it('keeps the slice closure inside client-safe modules', () => {
    const closure = transitiveClosure(path.join(srcDir, 'i18n', 'combat.ts'));
    // `languages.ts` is intentionally absent: every slice use of
    // `InterfaceLanguage` is type-only and erased at build.
    const expected = new Set(
      ['combat.ts', 'combat-en.ts', 'combat-pl.ts', 'format.ts', 'plural.ts'].map((name) =>
        path.join(srcDir, 'i18n', name),
      ),
    );
    expect([...closure].sort()).toEqual([...expected].sort());
    for (const file of closure) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, `${file} must never import server-only`).not.toMatch(
        /from\s*['"]server-only['"]|import\s*['"]server-only['"]/,
      );
    }
  });

  it('never imports the server-side catalogue from client components', () => {
    const offenders: string[] = [];
    const visit = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          visit(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name)) continue;
        const source = fs.readFileSync(full, 'utf8');
        if (!source.includes("'use client'") && !source.includes('"use client"')) continue;
        for (const specifier of runtimeImports(full)) {
          if (
            specifier === '@/i18n' ||
            specifier === '@/i18n/index' ||
            specifier === '@/i18n/en' ||
            specifier === '@/i18n/pl' ||
            specifier === '@/i18n/catalogues' ||
            /(^|\/)i18n\/(index|en|pl|catalogues)$/.test(specifier) ||
            /(^|\/)i18n\/(index|en|pl|catalogues)\.tsx?$/.test(specifier)
          ) {
            offenders.push(`${path.relative(repoRoot, full)} imports ${specifier}`);
          }
        }
      }
    };
    visit(srcDir);
    expect(offenders).toEqual([]);
  });
});
