// Playthrough document version 3: the first Combat MVP 1.0 Playthrough
// document (docs/spec/combat-contract.md, Playthrough schemaVersion 3;
// ADR 0009). The key `stateVersion` is never written again: the strict schema
// below rejects it, which ends its collision with the MVP's concurrency
// meaning (the enclosing document's `step` is the concurrency revision).
//
// Delta from v2 (see src/engine/state.ts): `schemaVersion: 3` replaces
// `stateVersion: 2`, Character Health is 0..40 (the hero profile's maximum,
// ADR 0010), `activeCombat` holds the §12 Combat state, `encounters` records
// damage taken per participant, and the Companion presence travels in
// `companion`/`lostCompanions`. Journey fields outside Combat are unchanged.
// P6 (Scenario adapter) owns gameplay on this document; P2 owns the document,
// its read-only paths and its store round-trip.

import { z } from 'zod';

import { PROFILES } from './combat/rules';
import { parseCombatState } from './combat/parse';
import type { CombatState, ParseIssue } from './combat/types';

/** The Playthrough schema version for Combat MVP 1.0 documents. */
export const PLAYTHROUGH_SCHEMA_VERSION = 3 as const;

/** Campaign Health bounds: the hero profile's maximum (ADR 0010). */
export const PLAYTHROUGH_MAX_HEALTH = PROFILES['hero'].maxHp;

const attributesV3Schema = z.strictObject({
  might: z.number().int().min(0).max(3),
  agility: z.number().int().min(0).max(3),
  wits: z.number().int().min(0).max(3),
  presence: z.number().int().min(0).max(3),
});

export type BaseAttributesV3 = z.infer<typeof attributesV3Schema>;

const takenOnceChoiceV3Schema = z.strictObject({
  sceneId: z.string(),
  choiceId: z.string(),
});

/**
 * The active Combat: the Encounter it was started from and the §12 Combat
 * state. The Combat itself is validated by the core's strict parser on read,
 * so a wrong `rulesVersion` or bad frozen plans surface as a read-only reason
 * rather than a shapeless envelope failure.
 */
const activeCombatV3Schema = z.strictObject({
  encounterId: z.string(),
  combat: z.unknown(),
});

/** The Playthrough v3 document envelope (Combat validated separately). */
export const PlaythroughV3EnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(PLAYTHROUGH_SCHEMA_VERSION),
  scenarioId: z.string(),
  scenarioVersion: z.string(),
  contentHash: z.string(),
  status: z.enum(['active', 'ended']),
  endingId: z.string().optional(),
  step: z.number().int().min(0),
  character: z.strictObject({
    templateId: z.string(),
    name: z.string(),
    baseAttributes: attributesV3Schema,
    health: z.number().int().min(0).max(PLAYTHROUGH_MAX_HEALTH),
  }),
  inventory: z.record(z.string(), z.number().int().min(1)),
  equipment: z.strictObject({
    weapon: z.string().optional(),
    outfit: z.string().optional(),
    talisman: z.string().optional(),
  }),
  companion: z.strictObject({ id: z.string() }).nullable(),
  lostCompanions: z.array(z.string()),
  currentLocationId: z.string(),
  activeSceneId: z.string().nullable().optional(),
  activeCombat: activeCombatV3Schema.nullable(),
  visited: z.array(z.string()),
  revealed: z.array(z.string()),
  firedScenes: z.array(z.string()),
  takenOnceChoices: z.array(takenOnceChoiceV3Schema),
  flags: z.array(z.string()),
  /**
   * Damage taken per Encounter id per participant id, with an entry, 0
   * included, for every participant the Encounter had at creation. A
   * participant is defeated when its Damage taken reaches its maximum; the
   * Encounter is defeated when every participant is.
   */
  encounters: z.record(z.string(), z.record(z.string(), z.number().int().min(0))),
});

export type PlaythroughV3Envelope = z.infer<typeof PlaythroughV3EnvelopeSchema>;

/** The validated Playthrough v3 document: the Combat is a parsed CombatState. */
export type PlaythroughV3 = Omit<PlaythroughV3Envelope, 'activeCombat'> & {
  activeCombat: { encounterId: string; combat: CombatState } | null;
};

export type PlaythroughV3IssueCode =
  | 'malformed'
  | 'unknown_schema_version'
  | 'unexpected_state_version'
  | 'bad_envelope'
  | 'bad_combat';

export interface PlaythroughV3Issue {
  code: PlaythroughV3IssueCode;
  /** Human-debuggable detail; never Interface Text (the engine holds no text). */
  detail?: string;
  /** The core's strict-parser issues when the embedded Combat is invalid. */
  combatIssues?: ParseIssue[];
}

export type PlaythroughV3Read =
  | { ok: true; state: PlaythroughV3 }
  | { ok: false; issues: PlaythroughV3Issue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read a stored Playthrough v3 document: envelope first, then the embedded
 * §12 Combat state when a fight is active. A malformed document, an unknown
 * `schemaVersion`, a lingering `stateVersion` key or a Combat the strict
 * parser rejects (including a wrong `rulesVersion`) reads as a failure the
 * caller renders read-only with the Journal: the row is never rewritten here.
 * Frozen-plan recomputation (P1b) plugs into the Combat parse once it lands;
 * until then structural plan checks apply.
 */
export function readPlaythroughV3Document(value: unknown): PlaythroughV3Read {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ code: 'malformed' }] };
  }
  if ('stateVersion' in value || 'expectedStateVersion' in value) {
    return { ok: false, issues: [{ code: 'unexpected_state_version' }] };
  }
  if (value['schemaVersion'] !== PLAYTHROUGH_SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [
        {
          code: 'unknown_schema_version',
          detail:
            typeof value['schemaVersion'] === 'number' || typeof value['schemaVersion'] === 'string'
              ? String(value['schemaVersion'])
              : 'missing',
        },
      ],
    };
  }
  const envelope = PlaythroughV3EnvelopeSchema.safeParse(value);
  if (!envelope.success) {
    return {
      ok: false,
      issues: [{ code: 'bad_envelope', detail: envelope.error.issues[0]?.message }],
    };
  }
  if (envelope.data.activeCombat === null) {
    return { ok: true, state: { ...envelope.data, activeCombat: null } };
  }
  const combat = parseCombatState(envelope.data.activeCombat.combat);
  if (!combat.ok) {
    return { ok: false, issues: [{ code: 'bad_combat', combatIssues: combat.issues }] };
  }
  return {
    ok: true,
    state: {
      ...envelope.data,
      activeCombat: { encounterId: envelope.data.activeCombat.encounterId, combat: combat.state },
    },
  };
}
