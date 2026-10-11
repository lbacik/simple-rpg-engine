// Stored Playthrough state document (docs/spec/playthrough-state.md,
// stored-and-derived-state table; docs/spec/architecture.md, engine contract).
//
// The document carries a `stateVersion`, is validated with Zod when read, and
// refers to Scenario content only by ID. Later tickets fill in behaviour, not
// shape: every area of the stored-state table is present here from the start.

import { z } from 'zod';

export const STATE_VERSION = 1 as const;

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

const activeCombatSchema = z.strictObject({
  encounterId: z.string(),
  range: z.enum(['near', 'far']),
  round: z.number().int().min(1),
});

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
  encounterDamage: z.record(z.string(), z.number().int().min(0)),
});

export type PlaythroughState = z.infer<typeof PlaythroughStateSchema>;

export function parsePlaythroughState(value: unknown): PlaythroughState {
  return PlaythroughStateSchema.parse(value);
}
