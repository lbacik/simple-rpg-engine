// Stored Playthrough state document, version 2: the tactical Combat state
// (docs/spec/playthrough-state.md, stored-and-derived-state table;
// docs/spec/architecture.md, engine contract; tactical-combat-handoff package
// "Round resolution and actions", issue #120).
//
// The document carries a `stateVersion`, is validated with Zod when read, and
// refers to Scenario content only by ID. State version 1 is frozen in
// `./state-v1`: v1 documents reach v2 through the deterministic migration the
// state-versions package owns (issue #124), which reuses the Intent selection
// in `tactical.ts` with the Prepare draw disabled.

import { z } from 'zod';

/** The current state version: the tactical Combat state. */
export const STATE_VERSION = 2 as const;

/** Every Character has 12 maximum Health (docs/spec/mechanics.md). */
export const MAX_HEALTH = 12 as const;

const attributesSchema = z.strictObject({
  might: z.number().int().min(0).max(3),
  agility: z.number().int().min(0).max(3),
  wits: z.number().int().min(0).max(3),
  presence: z.number().int().min(0).max(3),
});

export type BaseAttributes = z.infer<typeof attributesSchema>;

const takenOnceChoiceSchema = z.strictObject({
  sceneId: z.string(),
  choiceId: z.string(),
});

/** A committed Enemy Intent kind (docs/spec/mechanics.md, intent vocabulary). */
export const intentKindSchema = z.enum(['strike', 'close-in', 'prepare', 'heavy-attack']);

export type IntentKind = z.infer<typeof intentKindSchema>;

/**
 * One surviving participant's Combat state: the Range to it, its committed
 * Intent (the kind only; Speed, Damage and wording are derived), whether it
 * is prepared, and the last round of its Wary, if any. Round-scoped effects
 * (Guarded, the once-per-Round counterattack) are never stored: a whole Round
 * resolves in one step. A defeated participant loses this record, but its id
 * remains in the Combat's starting membership until the Combat ends.
 */
const combatParticipantSchema = z.strictObject({
  range: z.enum(['near', 'far']),
  intent: intentKindSchema,
  prepared: z.boolean(),
  waryUntilRound: z.number().int().min(1).optional(),
});

export type CombatParticipantState = z.infer<typeof combatParticipantSchema>;

/**
 * The active tactical Combat: the Encounter, the round number, the
 * participant ids that started this Combat, the participant-id tie-break
 * order captured when the current Round's Intents were selected, and each
 * surviving participant's state. Reading, reloading or a rejected action
 * never re-selects or changes the stored Intents; cleanup captures the
 * current content order for the next Round before selecting its Intents.
 */
const activeCombatSchema = z.strictObject({
  encounterId: z.string(),
  round: z.number().int().min(1),
  startedParticipants: z.array(z.string()).min(1).max(2),
  roundParticipantOrder: z.array(z.string()).min(1).max(2),
  participants: z.record(z.string(), combatParticipantSchema),
});

export type ActiveCombatState = z.infer<typeof activeCombatSchema>;

/** The tactical Playthrough state document (state version 2). */
export const PlaythroughStateSchema = z.strictObject({
  stateVersion: z.literal(STATE_VERSION),
  scenarioId: z.string(),
  scenarioVersion: z.string(),
  contentHash: z.string(),
  status: z.enum(['active', 'ended']),
  endingId: z.string().optional(),
  step: z.number().int().min(0),
  character: z.strictObject({
    templateId: z.string(),
    name: z.string(),
    baseAttributes: attributesSchema,
    health: z.number().int().min(0).max(12),
  }),
  inventory: z.record(z.string(), z.number().int().min(1)),
  equipment: z.strictObject({
    weapon: z.string().optional(),
    outfit: z.string().optional(),
    talisman: z.string().optional(),
  }),
  currentLocationId: z.string(),
  activeSceneId: z.string().nullable().optional(),
  activeCombat: activeCombatSchema.nullable().optional(),
  visited: z.array(z.string()),
  revealed: z.array(z.string()),
  firedScenes: z.array(z.string()),
  takenOnceChoices: z.array(takenOnceChoiceSchema),
  flags: z.array(z.string()),
  /**
   * Damage taken per Encounter id per participant id, with an entry, 0
   * included, for every participant the Encounter had at creation. A
   * participant is defeated when its Damage taken reaches its Enemy's maximum
   * Health; the Encounter is defeated when every participant is.
   */
  encounters: z.record(z.string(), z.record(z.string(), z.number().int().min(0))),
});

export type PlaythroughState = z.infer<typeof PlaythroughStateSchema>;

export function parsePlaythroughState(value: unknown): PlaythroughState {
  return PlaythroughStateSchema.parse(value);
}
