// Stored Playthrough state document, version 2: the journey state without
// Combat (docs/spec/playthrough-state.md, stored-and-derived-state table;
// docs/spec/architecture.md, engine contract). S4 (Combat MVP 1.0) deletes
// the tactical Combat state; the Scenario Combat adapter (P6) stores the
// shared core state in the v3 document instead.
//
// The document carries a `stateVersion`, is validated with Zod when read, and
// refers to Scenario content only by ID.

import { z } from 'zod';

/** The current state version. */
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

/** The Playthrough state document (state version 2). */
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
