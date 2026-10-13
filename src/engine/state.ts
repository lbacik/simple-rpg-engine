// Stored Playthrough state document (docs/spec/playthrough-state.md,
// stored-and-derived-state table; docs/spec/architecture.md, engine contract).
//
// The document carries a `stateVersion`, is validated with Zod when read, and
// refers to Scenario content only by ID. Later tickets fill in behaviour, not
// shape: every area of the stored-state table is present here from the start.
//
// State version 1 is frozen in `./state-v1`: this module re-exports it so the
// live reader and the frozen contract cannot drift before v2 lands.

import {
  PlaythroughStateV1Schema,
  STATE_VERSION_V1,
  parsePlaythroughStateV1,
  type BaseAttributesV1,
  type PlaythroughStateV1,
} from './state-v1';

export const STATE_VERSION = STATE_VERSION_V1 as typeof STATE_VERSION_V1;

/** Every Character has 12 maximum Health (docs/spec/mechanics.md). */
export const MAX_HEALTH = 12 as const;

export type BaseAttributes = BaseAttributesV1;

export const PlaythroughStateSchema = PlaythroughStateV1Schema;

export type PlaythroughState = PlaythroughStateV1;

export function parsePlaythroughState(value: unknown): PlaythroughState {
  return parsePlaythroughStateV1(value);
}
