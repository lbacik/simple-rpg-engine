// Phase 4 (Playability) validation: docs/spec/validation.md, codes play/*.
//
// Two static analyses over the compiled model (which phase 3 proved total):
// an over-approximating reachability fixpoint with three-valued (Kleene)
// Condition evaluation, and a way-out analysis over play positions paired
// with the current Location, ignoring every Condition. Diagnostics point at
// the `id` node of the entity concerned.

import type { Diagnostic, DiagnosticRange } from './diagnostic';
import type { AttributeName } from './model';
import type {
  CompiledChoice,
  CompiledCondition,
  CompiledEncounter,
  CompiledOutcome,
  CompiledScene,
  Scenario,
} from './model';
import { isRecord, nodeAtPath } from './structure';
import type { ParsedFile } from './structure';
import { nodeRange } from './yamlFile';

type Ctx = {
  scenario: Scenario;
  push: (diagnostic: Diagnostic) => void;
  /** Range of the `id` node of an entity, for pointing diagnostics. */
  idRange: (namespace: Namespace, id: string) => DiagnosticRange | undefined;
  fileOf: (namespace: Namespace, id: string) => string | undefined;
};

type Namespace =
  | 'locations'
  | 'scenes'
  | 'encounters'
  | 'endings'
  | 'items'
  | 'enemies'
  | 'images';

type Decl = { file: string; path: (string | number)[] };

function buildDeclIndex(files: ParsedFile[]): {
  decls: Record<Namespace, Map<string, Decl>>;
  /** Scene id -> choice id -> declaration. */
  choices: Map<string, Map<string, Decl>>;
  manifest: ParsedFile | undefined;
} {
  const decls: Record<Namespace, Map<string, Decl>> = {
    locations: new Map(),
    scenes: new Map(),
    encounters: new Map(),
    endings: new Map(),
    items: new Map(),
    enemies: new Map(),
    images: new Map(),
  };
  const choices = new Map<string, Map<string, Decl>>();
  for (const file of files) {
    if (file.section === 'locations' || file.section === 'scenes') {
      if (isRecord(file.value) && typeof file.value['id'] === 'string') {
        const id = file.value['id'];
        const map = decls[file.section];
        if (!map.has(id)) map.set(id, { file: file.file, path: ['id'] });
        if (file.section === 'scenes' && Array.isArray(file.value['choices'])) {
          const byChoice = new Map<string, Decl>();
          file.value['choices'].forEach((choice: unknown, index: number) => {
            if (isRecord(choice) && typeof choice['id'] === 'string' && !byChoice.has(choice['id'])) {
              byChoice.set(choice['id'], { file: file.file, path: ['choices', index, 'id'] });
            }
          });
          if (!choices.has(id)) choices.set(id, byChoice);
        }
      }
      continue;
    }
    if (
      (file.section === 'items' ||
        file.section === 'enemies' ||
        file.section === 'encounters' ||
        file.section === 'endings' ||
        file.section === 'images') &&
      Array.isArray(file.value)
    ) {
      const map = decls[file.section];
      file.value.forEach((entry: unknown, index: number) => {
        if (isRecord(entry) && typeof entry['id'] === 'string' && !map.has(entry['id'])) {
          map.set(entry['id'], { file: file.file, path: [index, 'id'] });
        }
      });
    }
  }
  return { decls, choices, manifest: undefined };
}

// ---------------------------------------------------------------------------
// Condition evaluation (three-valued / Kleene).
// ---------------------------------------------------------------------------

type Truth = 'true' | 'false' | 'unknown';

type ReachState = {
  locations: Set<string>;
  scenes: Set<string>;
  encounters: Set<string>;
  setFlags: Set<string>;
  obtainableItems: Set<string>;
};

function attributeBounds(scenario: Scenario, obtainable: Set<string>): Record<AttributeName, { hi: number; lo: number; slots: number }> {
  const attrs: AttributeName[] = ['might', 'agility', 'wits', 'presence'];
  const bounds = {} as Record<AttributeName, { hi: number; lo: number; slots: number }>;
  for (const attr of attrs) {
    let hi = Number.NEGATIVE_INFINITY;
    let lo = Number.POSITIVE_INFINITY;
    for (const template of scenario.templates) {
      const base = template.attributes[attr];
      if (base > hi) hi = base;
      if (base < lo) lo = base;
    }
    if (hi === Number.NEGATIVE_INFINITY) {
      hi = 0;
      lo = 0;
    }
    const slots = new Set<string>();
    for (const item of scenario.items) {
      if (item.kind !== 'equipment' || item.bonus !== attr) continue;
      if (!obtainable.has(item.id)) continue;
      slots.add(item.slot);
    }
    bounds[attr] = { hi, lo, slots: slots.size };
  }
  return bounds;
}

function evalCondition(
  condition: CompiledCondition,
  state: ReachState,
  scenario: Scenario,
): Truth {
  const record = condition as Record<string, unknown>;
  if ('flag' in record) {
    return state.setFlags.has(record['flag'] as string) ? 'unknown' : 'false';
  }
  if ('has' in record) {
    const inner = record['has'] as { item: string };
    return state.obtainableItems.has(inner.item) ? 'unknown' : 'false';
  }
  if ('visited' in record) {
    return state.locations.has(record['visited'] as string) ? 'unknown' : 'false';
  }
  if ('fired' in record) {
    return state.scenes.has(record['fired'] as string) ? 'unknown' : 'false';
  }
  if ('defeated' in record) {
    return state.encounters.has(record['defeated'] as string) ? 'unknown' : 'false';
  }
  if ('attribute' in record) {
    const inner = record['attribute'] as { name: AttributeName; atLeast?: number; atMost?: number };
    const bounds = attributeBounds(scenario, state.obtainableItems)[inner.name];
    if (inner.atLeast !== undefined) {
      return inner.atLeast > bounds.hi + Math.min(2, bounds.slots) ? 'false' : 'unknown';
    }
    if (inner.atMost !== undefined) {
      return inner.atMost < bounds.lo ? 'false' : 'unknown';
    }
    return 'unknown';
  }
  if ('health' in record) {
    return 'unknown';
  }
  if ('all' in record) {
    const members = record['all'] as CompiledCondition[];
    let seenUnknown = false;
    for (const member of members) {
      const value = evalCondition(member, state, scenario);
      if (value === 'false') return 'false';
      if (value === 'unknown') seenUnknown = true;
    }
    return seenUnknown ? 'unknown' : 'true';
  }
  if ('any' in record) {
    const members = record['any'] as CompiledCondition[];
    let seenUnknown = false;
    for (const member of members) {
      const value = evalCondition(member, state, scenario);
      if (value === 'true') return 'true';
      if (value === 'unknown') seenUnknown = true;
    }
    return seenUnknown ? 'false' : 'true';
  }
  if ('not' in record) {
    const value = evalCondition(record['not'] as CompiledCondition, state, scenario);
    if (value === 'true') return 'false';
    if (value === 'false') return 'true';
    return 'unknown';
  }
  return 'unknown';
}

function isSatisfiable(
  condition: CompiledCondition | undefined,
  state: ReachState,
  scenario: Scenario,
): boolean {
  if (condition === undefined) return true;
  return evalCondition(condition, state, scenario) !== 'false';
}

// ---------------------------------------------------------------------------
// Reachability fixpoint.
// ---------------------------------------------------------------------------

export type Reachability = {
  locations: Set<string>;
  scenes: Set<string>;
  encounters: Set<string>;
  endings: Set<string>;
};

function choiceOutcomes(choice: CompiledChoice): CompiledOutcome[] {
  if (choice.outcome !== undefined) return [choice.outcome];
  if (choice.test !== undefined) return [choice.test.success, choice.test.failure];
  return [];
}

function recordOutcomeGains(outcome: CompiledOutcome, state: ReachState): void {
  for (const effect of outcome.effects) {
    const record = effect as Record<string, unknown>;
    if ('set-flag' in record) state.setFlags.add(record['set-flag'] as string);
    if ('give-item' in record) {
      state.obtainableItems.add((record['give-item'] as { item: string }).item);
    }
  }
}

export function computeReachability(scenario: Scenario): Reachability {
  const state: ReachState = {
    locations: new Set([scenario.startLocation.id]),
    scenes: new Set(),
    encounters: new Set(),
    setFlags: new Set(),
    obtainableItems: new Set(),
  };
  const endings = new Set<string>();
  const reachableOutcomes = new Set<CompiledOutcome>();
  for (const template of scenario.templates) {
    for (const entry of template.items) state.obtainableItems.add(entry.item.id);
  }

  let changed = true;
  while (changed) {
    changed = false;
    const markLocation = (id: string): void => {
      if (!state.locations.has(id)) {
        state.locations.add(id);
        changed = true;
      }
    };
    const markScene = (id: string): void => {
      if (!state.scenes.has(id)) {
        state.scenes.add(id);
        changed = true;
      }
    };
    const markEncounter = (id: string): void => {
      if (!state.encounters.has(id)) {
        state.encounters.add(id);
        changed = true;
      }
    };
    const markEnding = (id: string): void => {
      if (!endings.has(id)) {
        endings.add(id);
        changed = true;
      }
    };
    const markOutcome = (outcome: CompiledOutcome): void => {
      if (!reachableOutcomes.has(outcome)) {
        reachableOutcomes.add(outcome);
        recordOutcomeGains(outcome, state);
        changed = true;
      }
    };

    for (const location of scenario.locations) {
      if (!state.locations.has(location.id)) continue;
      for (const scene of location.scenes) {
        if (isSatisfiable(scene.when, state, scenario)) markScene(scene.id);
      }
      for (const connection of location.connections) {
        if (isSatisfiable(connection.when, state, scenario)) markLocation(connection.to.id);
      }
    }
    for (const scene of scenario.scenes) {
      if (!state.scenes.has(scene.id)) continue;
      for (const choice of scene.choices) {
        if (!isSatisfiable(choice.when, state, scenario)) continue;
        for (const outcome of choiceOutcomes(choice)) markOutcome(outcome);
      }
    }
    for (const encounter of scenario.encounters) {
      if (!state.encounters.has(encounter.id)) continue;
      if (encounter.victory !== undefined) markOutcome(encounter.victory);
      markOutcome(encounter.escape);
    }
    for (const outcome of [...reachableOutcomes]) {
      if (outcome.next !== undefined) markScene(outcome.next.id);
      if (outcome.move !== undefined) markLocation(outcome.move.id);
      if (outcome.startCombat !== undefined) markEncounter(outcome.startCombat.id);
      if (outcome.end !== undefined) markEnding(outcome.end.id);
    }
  }

  return { locations: state.locations, scenes: state.scenes, encounters: state.encounters, endings };
}

// ---------------------------------------------------------------------------
// Way-out analysis: graph of play positions paired with the current Location,
// ignoring every Condition. Death is not a way out (no edge models it); an
// explicit `end` to the death Ending counts because it is an `end` edge.
// ---------------------------------------------------------------------------

type WayNode =
  | { kind: 'loc'; loc: string; cur: string }
  | { kind: 'scene'; scene: string; cur: string }
  | { kind: 'outcome'; index: number; cur: string }
  | { kind: 'encounter'; encounter: string; cur: string }
  | { kind: 'ending'; ending: string };

function wayKey(node: WayNode): string {
  switch (node.kind) {
    case 'loc':
      return `loc:${node.loc}:${node.cur}`;
    case 'scene':
      return `scene:${node.scene}:${node.cur}`;
    case 'outcome':
      return `outcome:${node.index}:${node.cur}`;
    case 'encounter':
      return `encounter:${node.encounter}:${node.cur}`;
    case 'ending':
      return `ending:${node.ending}`;
  }
}

type OutcomeEntry = {
  outcome: CompiledOutcome;
};

function collectOutcomes(scenario: Scenario): OutcomeEntry[] {
  const entries: OutcomeEntry[] = [];
  for (const scene of scenario.scenes) {
    for (const choice of scene.choices) {
      for (const outcome of choiceOutcomes(choice)) entries.push({ outcome });
    }
  }
  for (const encounter of scenario.encounters) {
    if (encounter.victory !== undefined) entries.push({ outcome: encounter.victory });
    entries.push({ outcome: encounter.escape });
  }
  return entries;
}

/** True when an Ending is reachable from `start` in the way-out graph. */
function hasWayOut(
  scenario: Scenario,
  start: WayNode,
  outcomeIndex: Map<CompiledOutcome, number>,
  outcomes: OutcomeEntry[],
): boolean {
  const sceneById = scenario.scenesById as Record<string, CompiledScene>;
  const locationById = scenario.locationsById as Record<string, import('./model').CompiledLocation>;
  const encounterById = scenario.encountersById as Record<string, CompiledEncounter>;
  const visited = new Set<string>();
  const queue: WayNode[] = [start];
  const successors = (node: WayNode): WayNode[] => {
    switch (node.kind) {
      case 'ending':
        return [];
      case 'loc': {
        const location = locationById[node.loc];
        if (!location) return [];
        const next: WayNode[] = [];
        for (const scene of location.scenes) next.push({ kind: 'scene', scene: scene.id, cur: node.cur });
        for (const connection of location.connections) {
          next.push({ kind: 'loc', loc: connection.to.id, cur: connection.to.id });
        }
        return next;
      }
      case 'scene': {
        const scene = sceneById[node.scene];
        if (!scene) return [];
        const next: WayNode[] = [];
        for (const choice of scene.choices) {
          for (const outcome of choiceOutcomes(choice)) {
            const index = outcomeIndex.get(outcome);
            if (index !== undefined) next.push({ kind: 'outcome', index, cur: node.cur });
          }
        }
        next.push({ kind: 'loc', loc: node.cur, cur: node.cur });
        return next;
      }
      case 'outcome': {
        const outcome = outcomes[node.index]?.outcome;
        if (!outcome) return [];
        if (outcome.next !== undefined) return [{ kind: 'scene', scene: outcome.next.id, cur: node.cur }];
        if (outcome.move !== undefined) return [{ kind: 'loc', loc: outcome.move.id, cur: outcome.move.id }];
        if (outcome.startCombat !== undefined) {
          return [{ kind: 'encounter', encounter: outcome.startCombat.id, cur: node.cur }];
        }
        if (outcome.end !== undefined) return [{ kind: 'ending', ending: outcome.end.id }];
        return [{ kind: 'loc', loc: node.cur, cur: node.cur }];
      }
      case 'encounter': {
        const encounter = encounterById[node.encounter];
        if (!encounter) return [];
        const next: WayNode[] = [];
        if (encounter.victory !== undefined) {
          const index = outcomeIndex.get(encounter.victory);
          if (index !== undefined) next.push({ kind: 'outcome', index, cur: node.cur });
        } else {
          next.push({ kind: 'loc', loc: node.cur, cur: node.cur });
        }
        const escapeIndex = outcomeIndex.get(encounter.escape);
        if (escapeIndex !== undefined) next.push({ kind: 'outcome', index: escapeIndex, cur: node.cur });
        return next;
      }
    }
  };
  while (queue.length > 0) {
    const node = queue.pop() as WayNode;
    const key = wayKey(node);
    if (visited.has(key)) continue;
    visited.add(key);
    if (node.kind === 'ending') return true;
    for (const next of successors(node)) {
      if (next.kind === 'ending') return true;
      queue.push(next);
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Gating helpers: a direct `has` / `not: { defeated }` or a direct entry of
// a top-level `all`. Deeper nesting does not count.
// ---------------------------------------------------------------------------

function isHasGate(when: CompiledCondition | undefined, item: string): boolean {
  if (when === undefined) return false;
  const record = when as unknown as Record<string, unknown>;
  if ('has' in record) return (record['has'] as { item: string }).item === item;
  if ('all' in record && Array.isArray(record['all'])) {
    return (record['all'] as unknown[]).some(
      (entry) =>
        isRecord(entry) && 'has' in entry && (entry['has'] as { item: string }).item === item,
    );
  }
  return false;
}

function isDefeatedGate(when: CompiledCondition | undefined, encounter: string): boolean {
  if (when === undefined) return false;
  const record = when as unknown as Record<string, unknown>;
  if ('not' in record && isRecord(record['not'])) {
    if ((record['not'] as Record<string, unknown>)['defeated'] === encounter) return true;
  }
  if ('all' in record && Array.isArray(record['all'])) {
    return (record['all'] as unknown[]).some(
      (entry) =>
        isRecord(entry) &&
        'not' in entry &&
        isRecord(entry['not']) &&
        (entry['not'] as Record<string, unknown>)['defeated'] === encounter,
    );
  }
  return false;
}

// ---------------------------------------------------------------------------
// Global scans used by the authoring-quality warnings.
// ---------------------------------------------------------------------------

function walkConditions(condition: CompiledCondition | undefined, visit: (node: Record<string, unknown>) => void): void {
  if (condition === undefined || !isRecord(condition)) return;
  visit(condition as Record<string, unknown>);
  const record = condition as Record<string, unknown>;
  if (Array.isArray(record['all'])) {
    for (const entry of record['all'] as unknown[]) {
      if (isRecord(entry)) walkConditions(entry as unknown as CompiledCondition, visit);
    }
  }
  if (Array.isArray(record['any'])) {
    for (const entry of record['any'] as unknown[]) {
      if (isRecord(entry)) walkConditions(entry as unknown as CompiledCondition, visit);
    }
  }
  if (isRecord(record['not'])) walkConditions(record['not'] as unknown as CompiledCondition, visit);
}

function allOutcomes(scenario: Scenario): CompiledOutcome[] {
  const result: CompiledOutcome[] = [];
  for (const scene of scenario.scenes) {
    for (const choice of scene.choices) result.push(...choiceOutcomes(choice));
  }
  for (const encounter of scenario.encounters) {
    if (encounter.victory !== undefined) result.push(encounter.victory);
    result.push(encounter.escape);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Phase entry point.
// ---------------------------------------------------------------------------

export function runPlayabilityPhase(
  scenario: Scenario,
  manifest: ParsedFile,
  files: ParsedFile[],
  push: (diagnostic: Diagnostic) => void,
): void {
  const { decls, choices } = buildDeclIndex(files);
  const fileContents = new Map<string, { contents: unknown; lineCounter: ParsedFile['lineCounter'] }>();
  for (const file of files) {
    fileContents.set(file.file, { contents: file.contents, lineCounter: file.lineCounter });
  }
  const idRange = (namespace: Namespace, id: string): DiagnosticRange | undefined => {
    const decl = decls[namespace].get(id);
    if (!decl) return undefined;
    const entry = fileContents.get(decl.file);
    if (!entry) return undefined;
    return nodeRange(nodeAtPath(entry.contents, decl.path), entry.lineCounter);
  };
  const fileOf = (namespace: Namespace, id: string): string | undefined => decls[namespace].get(id)?.file;
  const ctx: Ctx = { scenario, push, idRange, fileOf };

  const reachability = computeReachability(scenario);
  checkVictory(ctx, reachability);
  checkNoWayOut(ctx, reachability);
  checkUnreachable(ctx, reachability);
  checkAllChoicesConditional(ctx);
  checkTakeWithoutHas(ctx, choices, fileContents);
  checkRepeatableCombat(ctx);
  checkNextToFiredScene(ctx);
  checkFlags(ctx, manifest);
  checkItems(ctx);
  checkEnemyUnused(ctx);
  checkImageUnused(ctx);
  checkMaps(ctx);
}

function checkVictory(ctx: Ctx, reachability: Reachability): void {
  const victoryReachable = ctx.scenario.endings.some(
    (ending) => ending.kind === 'victory' && reachability.endings.has(ending.id),
  );
  if (!victoryReachable) {
    ctx.push({
      severity: 'error',
      code: 'play/no-victory',
      message: 'no ending of kind "victory" is reachable; the scenario certainly cannot be won',
    });
  }
}

function checkNoWayOut(ctx: Ctx, reachability: Reachability): void {
  const scenario = ctx.scenario;
  const outcomes = collectOutcomes(scenario);
  const outcomeIndex = new Map<CompiledOutcome, number>();
  outcomes.forEach((entry, index) => outcomeIndex.set(entry.outcome, index));

  for (const location of scenario.locations) {
    if (!reachability.locations.has(location.id)) continue;
    const start: WayNode = { kind: 'loc', loc: location.id, cur: location.id };
    if (!hasWayOut(scenario, start, outcomeIndex, outcomes)) {
      ctx.push({
        severity: 'error',
        code: 'play/no-way-out',
        message: `location "${location.id}" has no way out; no ending can be reached from here`,
        file: ctx.fileOf('locations', location.id),
        range: ctx.idRange('locations', location.id),
        path: ['id'],
      });
    }
  }
  for (const scene of scenario.scenes) {
    if (!reachability.scenes.has(scene.id)) continue;
    // A follow-on Scene may be entered with any current Location; it is only
    // certainly stuck when no pairing reaches an Ending.
    const currents = scene.location !== undefined ? [scene.location.id] : scenario.locations.map((l) => l.id);
    const stuck = currents.every(
      (cur) => !hasWayOut(scenario, { kind: 'scene', scene: scene.id, cur }, outcomeIndex, outcomes),
    );
    if (stuck) {
      ctx.push({
        severity: 'error',
        code: 'play/no-way-out',
        message: `scene "${scene.id}" has no way out; no ending can be reached from here`,
        file: ctx.fileOf('scenes', scene.id),
        range: ctx.idRange('scenes', scene.id),
        path: ['id'],
      });
    }
  }
}

function checkUnreachable(ctx: Ctx, reachability: Reachability): void {
  for (const location of ctx.scenario.locations) {
    if (reachability.locations.has(location.id)) continue;
    ctx.push({
      severity: 'warning',
      code: 'play/unreachable-location',
      message: `location "${location.id}" is not reachable`,
      file: ctx.fileOf('locations', location.id),
      range: ctx.idRange('locations', location.id),
      path: ['id'],
    });
  }
  for (const scene of ctx.scenario.scenes) {
    if (reachability.scenes.has(scene.id)) continue;
    ctx.push({
      severity: 'warning',
      code: 'play/unreachable-scene',
      message: `scene "${scene.id}" is not reachable`,
      file: ctx.fileOf('scenes', scene.id),
      range: ctx.idRange('scenes', scene.id),
      path: ['id'],
    });
  }
  for (const encounter of ctx.scenario.encounters) {
    if (reachability.encounters.has(encounter.id)) continue;
    ctx.push({
      severity: 'warning',
      code: 'play/unreachable-encounter',
      message: `encounter "${encounter.id}" is not reachable`,
      file: ctx.fileOf('encounters', encounter.id),
      range: ctx.idRange('encounters', encounter.id),
      path: ['id'],
    });
  }
  for (const ending of ctx.scenario.endings) {
    if (ending.id === ctx.scenario.deathEnding.id) continue;
    if (reachability.endings.has(ending.id)) continue;
    ctx.push({
      severity: 'warning',
      code: 'play/unreachable-ending',
      message: `ending "${ending.id}" is not reachable`,
      file: ctx.fileOf('endings', ending.id),
      range: ctx.idRange('endings', ending.id),
      path: ['id'],
    });
  }
}

function checkAllChoicesConditional(ctx: Ctx): void {
  for (const scene of ctx.scenario.scenes) {
    if (scene.choices.length === 0) continue;
    if (!scene.choices.every((choice) => choice.when !== undefined)) continue;
    ctx.push({
      severity: 'warning',
      code: 'play/all-choices-conditional',
      message: `scene "${scene.id}" has choices but every choice has a "when"; the engine offers the implicit Continue when none is visible`,
      file: ctx.fileOf('scenes', scene.id),
      range: ctx.idRange('scenes', scene.id),
      path: ['id'],
    });
  }
}

function takeItemsOf(outcome: CompiledOutcome): string[] {
  const items: string[] = [];
  for (const effect of outcome.effects) {
    const record = effect as unknown as Record<string, unknown>;
    if ('take-item' in record) items.push((record['take-item'] as { item: string }).item);
  }
  return items;
}

function checkTakeWithoutHas(
  ctx: Ctx,
  choices: Map<string, Map<string, Decl>>,
  fileContents: Map<string, { contents: unknown; lineCounter: ParsedFile['lineCounter'] }>,
): void {
  const choiceIdRange = (sceneId: string, choiceId: string): { file?: string; range?: DiagnosticRange } => {
    const decl = choices.get(sceneId)?.get(choiceId);
    if (!decl) return {};
    const entry = fileContents.get(decl.file);
    if (!entry) return { file: decl.file };
    return { file: decl.file, range: nodeRange(nodeAtPath(entry.contents, decl.path), entry.lineCounter) };
  };
  const reported = new Set<string>();
  for (const scene of ctx.scenario.scenes) {
    for (const choice of scene.choices) {
      for (const outcome of choiceOutcomes(choice)) {
        for (const item of takeItemsOf(outcome)) {
          const gated = isHasGate(choice.when, item) || isHasGate(scene.when, item);
          if (gated) continue;
          const key = `${scene.id}:${choice.id}:${item}`;
          if (reported.has(key)) continue;
          reported.add(key);
          const pos = choiceIdRange(scene.id, choice.id);
          ctx.push({
            severity: 'warning',
            code: 'play/take-without-has',
            message: `choice "${choice.id}" in scene "${scene.id}" takes item "${item}" without a "has" gate`,
            file: pos.file ?? ctx.fileOf('scenes', scene.id),
            range: pos.range ?? ctx.idRange('scenes', scene.id),
            path: ['id'],
          });
        }
      }
    }
  }
  for (const encounter of ctx.scenario.encounters) {
    const outcomes = encounter.victory !== undefined ? [encounter.victory, encounter.escape] : [encounter.escape];
    for (const outcome of outcomes) {
      for (const item of takeItemsOf(outcome)) {
        ctx.push({
          severity: 'warning',
          code: 'play/take-without-has',
          message: `encounter "${encounter.id}" takes item "${item}" without a "has" gate; an encounter outcome can never be gated`,
          file: ctx.fileOf('encounters', encounter.id),
          range: ctx.idRange('encounters', encounter.id),
          path: ['id'],
        });
      }
    }
  }
}

function startCombatsOf(outcome: CompiledOutcome): string[] {
  return outcome.startCombat !== undefined ? [outcome.startCombat.id] : [];
}

function checkRepeatableCombat(ctx: Ctx): void {
  const reported = new Set<string>();
  for (const scene of ctx.scenario.scenes) {
    if (!scene.repeatable) continue;
    for (const choice of scene.choices) {
      for (const outcome of choiceOutcomes(choice)) {
        for (const encounter of startCombatsOf(outcome)) {
          const gated = isDefeatedGate(scene.when, encounter) || isDefeatedGate(choice.when, encounter);
          if (gated) continue;
          const key = `${scene.id}:${encounter}`;
          if (reported.has(key)) continue;
          reported.add(key);
          ctx.push({
            severity: 'warning',
            code: 'play/repeatable-combat',
            message: `scene "${scene.id}" is repeatable and starts combat "${encounter}" without a "not defeated" gate`,
            file: ctx.fileOf('scenes', scene.id),
            range: ctx.idRange('scenes', scene.id),
            path: ['id'],
          });
        }
      }
    }
  }
}

function checkNextToFiredScene(ctx: Ctx): void {
  const scenario = ctx.scenario;
  // sourceKey -> { repeatable: boolean }
  const targets = new Map<string, Map<string, { repeatable: boolean; escape: boolean }>>();
  const addSource = (target: string, sourceKey: string, repeatable: boolean, escape: boolean): void => {
    let sources = targets.get(target);
    if (!sources) {
      sources = new Map();
      targets.set(target, sources);
    }
    const existing = sources.get(sourceKey);
    if (!existing) sources.set(sourceKey, { repeatable, escape });
    else if (repeatable) existing.repeatable = true;
    if (escape && existing) existing.escape = true;
  };
  for (const scene of scenario.scenes) {
    for (const choice of scene.choices) {
      for (const outcome of choiceOutcomes(choice)) {
        if (outcome.next !== undefined) {
          addSource(outcome.next.id, `scene:${scene.id}`, scene.repeatable, false);
        }
      }
    }
  }
  for (const encounter of scenario.encounters) {
    if (encounter.victory?.next !== undefined) {
      addSource(encounter.victory.next.id, `encounter:${encounter.id}`, false, false);
    }
    if (encounter.escape.next !== undefined) {
      const key = `encounter:${encounter.id}`;
      const sources = targets.get(encounter.escape.next.id);
      const existing = sources?.get(key);
      if (existing) {
        existing.escape = true;
        existing.repeatable = true;
      } else {
        addSource(encounter.escape.next.id, key, true, true);
      }
    }
  }
  for (const target of scenario.scenes) {
    if (target.repeatable) continue;
    const sources = targets.get(target.id);
    if (!sources || sources.size === 0) continue;
    const multiSource = sources.size >= 2;
    const repeatableSource = [...sources.values()].some((source) => source.repeatable);
    const selfSource = sources.has(`scene:${target.id}`);
    if (!multiSource && !repeatableSource && !selfSource) continue;
    const reason = selfSource
      ? `scene "${target.id}" is its own source`
      : repeatableSource
        ? 'a source is repeatable'
        : 'two or more distinct sources lead to it';
    ctx.push({
      severity: 'warning',
      code: 'play/next-to-fired-scene',
      message: `"next" targets non-repeatable scene "${target.id}" and ${reason}; it fires only once`,
      file: ctx.fileOf('scenes', target.id),
      range: ctx.idRange('scenes', target.id),
      path: ['id'],
    });
  }
}

function checkFlags(ctx: Ctx, manifest: ParsedFile): void {
  const scenario = ctx.scenario;
  const setBy = new Set<string>();
  for (const outcome of allOutcomes(scenario)) {
    for (const effect of outcome.effects) {
      const record = effect as unknown as Record<string, unknown>;
      if ('set-flag' in record) setBy.add(record['set-flag'] as string);
    }
  }
  const readBy = new Set<string>();
  const visitCondition = (condition: CompiledCondition | undefined): void => {
    walkConditions(condition, (node) => {
      if ('flag' in node && typeof node['flag'] === 'string') readBy.add(node['flag']);
    });
  };
  for (const scene of scenario.scenes) {
    visitCondition(scene.when);
    for (const choice of scene.choices) visitCondition(choice.when);
  }
  for (const location of scenario.locations) {
    for (const connection of location.connections) visitCondition(connection.when);
  }

  const flagIndex = new Map<string, number>();
  if (isRecord(manifest.value) && Array.isArray(manifest.value['flags'])) {
    (manifest.value['flags'] as unknown[]).forEach((flag, index) => {
      if (typeof flag === 'string' && !flagIndex.has(flag)) flagIndex.set(flag, index);
    });
  }
  const flagPos = (flag: string): { file?: string; range?: DiagnosticRange } => {
    const index = flagIndex.get(flag);
    if (index === undefined) return {};
    return {
      file: manifest.file,
      range: nodeRange(nodeAtPath(manifest.contents, ['flags', index]), manifest.lineCounter),
    };
  };
  for (const flag of scenario.flags) {
    const pos = flagPos(flag);
    if (!setBy.has(flag)) {
      ctx.push({
        severity: 'warning',
        code: 'play/flag-never-set',
        message: `flag "${flag}" is never set by any "set-flag"`,
        file: pos.file,
        range: pos.range,
        path: ['id'],
      });
    } else if (!readBy.has(flag)) {
      ctx.push({
        severity: 'warning',
        code: 'play/flag-never-read',
        message: `flag "${flag}" is set but never used in a condition`,
        file: pos.file,
        range: pos.range,
        path: ['id'],
      });
    }
  }
}

function checkItems(ctx: Ctx): void {
  const scenario = ctx.scenario;
  const inTemplate = new Set<string>();
  for (const template of scenario.templates) {
    for (const entry of template.items) inTemplate.add(entry.item.id);
  }
  const given = new Set<string>();
  for (const outcome of allOutcomes(scenario)) {
    for (const effect of outcome.effects) {
      const record = effect as unknown as Record<string, unknown>;
      if ('give-item' in record) given.add((record['give-item'] as { item: string }).item);
    }
  }
  const usedInCondition = new Set<string>();
  const visitCondition = (condition: CompiledCondition | undefined): void => {
    walkConditions(condition, (node) => {
      if ('has' in node && isRecord(node['has']) && typeof node['has']['item'] === 'string') {
        usedInCondition.add(node['has']['item']);
      }
    });
  };
  for (const scene of scenario.scenes) {
    visitCondition(scene.when);
    for (const choice of scene.choices) visitCondition(choice.when);
  }
  for (const location of scenario.locations) {
    for (const connection of location.connections) visitCondition(connection.when);
  }

  for (const item of scenario.items) {
    if (!inTemplate.has(item.id) && !given.has(item.id)) {
      ctx.push({
        severity: 'warning',
        code: 'play/item-never-obtainable',
        message: `item "${item.id}" is in no template and given by no "give-item"`,
        file: ctx.fileOf('items', item.id),
        range: ctx.idRange('items', item.id),
        path: ['id'],
      });
    }
    if (item.kind === 'key' && !usedInCondition.has(item.id)) {
      ctx.push({
        severity: 'warning',
        code: 'play/key-item-unused',
        message: `key item "${item.id}" is used in no condition`,
        file: ctx.fileOf('items', item.id),
        range: ctx.idRange('items', item.id),
        path: ['id'],
      });
    }
  }
}

function checkEnemyUnused(ctx: Ctx): void {
  const placed = new Set(ctx.scenario.encounters.map((encounter) => encounter.enemy.id));
  for (const enemy of ctx.scenario.enemies) {
    if (placed.has(enemy.id)) continue;
    ctx.push({
      severity: 'warning',
      code: 'play/enemy-unused',
      message: `enemy "${enemy.id}" has no encounter`,
      file: ctx.fileOf('enemies', enemy.id),
      range: ctx.idRange('enemies', enemy.id),
      path: ['id'],
    });
  }
}

function checkImageUnused(ctx: Ctx): void {
  const referenced = new Set<string>();
  for (const scene of ctx.scenario.scenes) {
    if (scene.illustration !== undefined) referenced.add(scene.illustration.id);
  }
  for (const location of ctx.scenario.locations) {
    if (location.illustration !== undefined) referenced.add(location.illustration.id);
  }
  for (const image of ctx.scenario.images) {
    if (referenced.has(image.id)) continue;
    ctx.push({
      severity: 'warning',
      code: 'play/image-unused',
      message: `image "${image.id}" is referenced by no scene or location`,
      file: ctx.fileOf('images', image.id),
      range: ctx.idRange('images', image.id),
      path: ['id'],
    });
  }
}

function checkMaps(ctx: Ctx): void {
  for (const location of ctx.scenario.locations) {
    if (location.map !== undefined) continue;
    ctx.push({
      severity: 'warning',
      code: 'play/missing-map-coordinates',
      message: `location "${location.id}" has no map coordinates`,
      file: ctx.fileOf('locations', location.id),
      range: ctx.idRange('locations', location.id),
      path: ['id'],
    });
  }
  const mapped = ctx.scenario.locations.filter((location) => location.map !== undefined);
  for (let i = 0; i < mapped.length; i++) {
    for (let j = i + 1; j < mapped.length; j++) {
      const a = mapped[i] as (typeof mapped)[number];
      const b = mapped[j] as (typeof mapped)[number];
      const dx = (a.map as { x: number; y: number }).x - (b.map as { x: number; y: number }).x;
      const dy = (a.map as { x: number; y: number }).y - (b.map as { x: number; y: number }).y;
      const distance = Math.hypot(dx, dy);
      if (distance >= 5) continue;
      ctx.push({
        severity: 'warning',
        code: 'play/map-too-close',
        message: `locations "${a.id}" and "${b.id}" are ${distance.toFixed(1)} units apart on the map (minimum 5)`,
        file: ctx.fileOf('locations', b.id),
        range: ctx.idRange('locations', b.id),
        path: ['id'],
      });
    }
  }
}
