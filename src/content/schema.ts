// Zod definitions: the source of truth for the structure of every file kind
// (docs/spec/scenario-format.md, field reference and conventions).
//
// These schemas check what Phase 2 owns (docs/spec/validation.md): strict
// objects (unknown keys), required keys, value types, vocabulary tokens and
// the per-entity mechanics ranges. Refinements that need cross-field logic
// (the Template point sum, mutually exclusive keys, narration rules) are
// enforced by custom checks in structure.ts; the loader and the CLI are the
// only enforcers for those. The same definitions generate the editor JSON
// Schemas (see jsonSchema.ts).
//
// Conventions encoded here:
// - objects are strict everywhere, so an unknown key fails;
// - field keys are camelCase, vocabulary tokens kebab-case (plain enums, so
//   `very hard` is rejected while `very-hard` is accepted);
// - one form per key, no shorthands (scalar vs mapping forms are fixed);
// - the Defaults table is encoded with .default(), so omitted keys resolve
//   to their defaults and the generated JSON Schemas document them.
//
// IDs and references are plain strings here: their shape ([a-z][a-z0-9-]*)
// and existence are Phase 3 (Integrity) checks. Text and narration fields
// are plain strings too: emptiness, braces and the Markdown subset are
// custom checks in structure.ts, so each gets its own schema/ code.

import { z } from 'zod';

export const attributeSchema = z.enum(['might', 'agility', 'wits', 'presence']);

const idSchema = z.string();
const referenceSchema = z.string();
const textSchema = z.string();
const narrationSchema = z.string();

// ---------------------------------------------------------------------------
// Conditions: one-key mappings, recursive through all/any/not.
// ---------------------------------------------------------------------------

const flagCondition = z.strictObject({ flag: referenceSchema });
const visitedCondition = z.strictObject({ visited: referenceSchema });
const firedCondition = z.strictObject({ fired: referenceSchema });
const defeatedCondition = z.strictObject({ defeated: referenceSchema });
const hasCondition = z.strictObject({
  has: z.strictObject({
    item: referenceSchema,
    atLeast: z.number().int().min(1).default(1),
  }),
});
// An attribute/health condition takes exactly one bound; the exactly-one
// rule is a custom check (schema/condition-bounds), so both bounds stay
// optional here.
const attributeCondition = z.strictObject({
  attribute: z.strictObject({
    name: attributeSchema,
    atLeast: z.number().int().min(1).max(5).optional(),
    atMost: z.number().int().min(0).max(4).optional(),
  }),
});
const healthCondition = z.strictObject({
  health: z.strictObject({
    atLeast: z.number().int().min(2).max(12).optional(),
    atMost: z.number().int().min(1).max(11).optional(),
  }),
});

// The branch keys in union order; structure.ts uses them to map a failed
// union to precise diagnostics (unknown keys, single-branch value errors).
export const CONDITION_BRANCH_KEYS = [
  'flag',
  'visited',
  'fired',
  'defeated',
  'has',
  'attribute',
  'health',
  'all',
  'any',
  'not',
] as const;

export const ConditionSchema: z.ZodTypeAny = z.union([
  flagCondition,
  visitedCondition,
  firedCondition,
  defeatedCondition,
  hasCondition,
  attributeCondition,
  healthCondition,
  // Non-empty: an empty combinator is schema/empty-combinator (mapped from
  // the minimum in structure.ts), and minItems also reaches the editor.
  z.strictObject({ all: z.array(z.lazy(() => ConditionSchema)).min(1) }),
  z.strictObject({ any: z.array(z.lazy(() => ConditionSchema)).min(1) }),
  z.strictObject({ not: z.lazy(() => ConditionSchema) }),
]);

// ---------------------------------------------------------------------------
// Effects: one-key mappings, scalar or fixed-shape params, no shorthands.
// ---------------------------------------------------------------------------

const setFlagEffect = z.strictObject({ 'set-flag': referenceSchema });
const clearFlagEffect = z.strictObject({ 'clear-flag': referenceSchema });
const revealEffect = z.strictObject({ reveal: referenceSchema });
const healEffect = z.strictObject({ heal: z.number().int().min(1).max(12) });
const damageEffect = z.strictObject({ damage: z.number().int().min(1).max(12) });
const giveItemEffect = z.strictObject({
  'give-item': z.strictObject({
    item: referenceSchema,
    quantity: z.number().int().min(1).default(1),
  }),
});
const takeItemEffect = z.strictObject({
  'take-item': z.strictObject({
    item: referenceSchema,
    quantity: z.number().int().min(1).default(1),
  }),
});

export const EFFECT_BRANCH_KEYS = [
  'set-flag',
  'clear-flag',
  'reveal',
  'heal',
  'damage',
  'give-item',
  'take-item',
] as const;

export const EffectSchema = z.union([
  setFlagEffect,
  clearFlagEffect,
  revealEffect,
  healEffect,
  damageEffect,
  giveItemEffect,
  takeItemEffect,
]);

// ---------------------------------------------------------------------------
// Outcomes, Tests, Choices.
// ---------------------------------------------------------------------------

export const OutcomeSchema = z.strictObject({
  text: narrationSchema.optional(),
  effects: z.array(EffectSchema).default([]),
  next: referenceSchema.optional(),
  move: referenceSchema.optional(),
  'start-combat': referenceSchema.optional(),
  end: referenceSchema.optional(),
});

const TRANSITION_KEYS = ['next', 'move', 'start-combat', 'end'] as const;
export type TransitionKey = (typeof TRANSITION_KEYS)[number];
export const transitionKeys: readonly string[] = TRANSITION_KEYS;

export const TestSchema = z.strictObject({
  attribute: attributeSchema,
  difficulty: z.enum(['easy', 'ordinary', 'hard', 'very-hard']),
  success: OutcomeSchema,
  failure: OutcomeSchema,
});

export const ChoiceSchema = z.strictObject({
  id: idSchema,
  text: textSchema,
  when: ConditionSchema.optional(),
  once: z.boolean().default(false),
  outcome: OutcomeSchema.optional(),
  test: TestSchema.optional(),
});

// ---------------------------------------------------------------------------
// Manifest (scenario.yaml).
// ---------------------------------------------------------------------------

export const ManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: idSchema,
  title: textSchema,
  description: textSchema,
  author: z.string().optional(),
  version: textSchema,
  language: z.string(),
  intro: narrationSchema.optional(),
  startLocation: referenceSchema,
  deathEnding: referenceSchema,
  flags: z.array(z.string()).default([]),
  locations: z.array(z.string()),
  scenes: z.array(z.string()).optional(),
  items: z.array(z.string()).optional(),
  enemies: z.array(z.string()).optional(),
  encounters: z.array(z.string()).optional(),
  templates: z.array(z.string()),
  endings: z.array(z.string()),
  images: z.array(z.string()).optional(),
  translations: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Location file: a single mapping with an explicit id.
// ---------------------------------------------------------------------------

const connectionSchema = z.strictObject({
  to: referenceSchema,
  label: textSchema.optional(),
  when: ConditionSchema.optional(),
});

export const LocationSchema = z.strictObject({
  id: idSchema,
  name: textSchema,
  description: narrationSchema,
  map: z
    .strictObject({
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
    })
    .optional(),
  illustration: referenceSchema.optional(),
  scenes: z.array(referenceSchema).default([]),
  connections: z.array(connectionSchema).default([]),
});

// ---------------------------------------------------------------------------
// Scene file: a single mapping with an explicit id.
// ---------------------------------------------------------------------------

export const SceneSchema = z.strictObject({
  id: idSchema,
  title: textSchema,
  trigger: z.enum(['on-enter', 'on-demand']).optional(),
  repeatable: z.boolean().default(false),
  when: ConditionSchema.optional(),
  illustration: referenceSchema.optional(),
  text: narrationSchema,
  choices: z.array(ChoiceSchema).default([]),
});

// ---------------------------------------------------------------------------
// Catalog files: sequences of mappings with explicit ids.
// ---------------------------------------------------------------------------

const equipmentItem = z.strictObject({
  id: idSchema,
  kind: z.literal('equipment'),
  name: textSchema,
  description: textSchema.optional(),
  slot: z.enum(['weapon', 'outfit', 'talisman']),
  bonus: attributeSchema.optional(),
  magic: z.boolean().default(false),
  reach: z.enum(['melee', 'ranged']).default('melee'),
  // Melee weapons allow 2-4; ranged weapons 2-3. The range depends on the
  // reach (whose default is melee), so Zod checks 2-4 and structure.ts
  // narrows ranged weapons to 2-3 (schema/invalid-value).
  damage: z.number().int().min(2).max(4).optional(),
});
const consumableItem = z.strictObject({
  id: idSchema,
  kind: z.literal('consumable'),
  name: textSchema,
  description: textSchema.optional(),
  heal: z.number().int().min(1).max(12),
  magic: z.boolean().default(false),
});
const keyItem = z.strictObject({
  id: idSchema,
  kind: z.literal('key'),
  name: textSchema,
  description: textSchema.optional(),
  magic: z.boolean().default(false),
});

export const ItemSchema = z.discriminatedUnion('kind', [
  equipmentItem,
  consumableItem,
  keyItem,
]);

const attributesSchema = z.strictObject({
  might: z.number().int().min(0).max(3),
  agility: z.number().int().min(0).max(3),
  wits: z.number().int().min(0).max(3),
  presence: z.number().int().min(0).max(3),
});

export const EnemySchema = z.strictObject({
  id: idSchema,
  name: textSchema,
  description: textSchema.optional(),
  attributes: attributesSchema,
  health: z.number().int().min(1).max(30),
  damage: z.number().int().min(1).max(6),
  reach: z.enum(['melee', 'ranged']).default('melee'),
});

export const EncounterSchema = z.strictObject({
  id: idSchema,
  enemy: referenceSchema,
  startRange: z.enum(['near', 'far']).default('far'),
  text: narrationSchema,
  victory: OutcomeSchema.optional(),
  escape: OutcomeSchema,
});

const templateItemSchema = z.strictObject({
  item: referenceSchema,
  quantity: z.number().int().min(1).default(1),
});

export const TemplateSchema = z.strictObject({
  id: idSchema,
  name: textSchema,
  description: textSchema.optional(),
  attributes: attributesSchema,
  items: z.array(templateItemSchema).optional(),
});

export const EndingSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(['victory', 'defeat']),
  title: textSchema,
  text: narrationSchema,
});

export const ImageSchema = z.strictObject({
  id: idSchema,
  path: z.string(),
  alt: textSchema,
});

// Catalog roots are bare sequences: no extra wrapper.
export const ItemsCatalogSchema = z.array(ItemSchema);
export const EnemiesCatalogSchema = z.array(EnemySchema);
export const EncountersCatalogSchema = z.array(EncounterSchema);
export const TemplatesCatalogSchema = z.array(TemplateSchema);
export const EndingsCatalogSchema = z.array(EndingSchema);
export const ImagesCatalogSchema = z.array(ImageSchema);

// ---------------------------------------------------------------------------
// Translations: text-only projections of the base file kinds
// (docs/spec/scenario-format.md, Translation files; ADR 0002). Every object is
// strict, so a non-translatable field (when, effects, map, ...) is
// schema/unknown-key. Mechanics exist only in the base files.
// ---------------------------------------------------------------------------

/** A Translation manifest: no schemaVersion, id, author or version. */
export const TranslationManifestSchema = z.strictObject({
  language: z.string(),
  baseVersion: z.string(),
  translator: z.string().optional(),
  title: textSchema,
  description: textSchema,
  intro: narrationSchema.optional(),
  locations: z.array(z.string()),
  scenes: z.array(z.string()).optional(),
  items: z.array(z.string()).optional(),
  enemies: z.array(z.string()).optional(),
  encounters: z.array(z.string()).optional(),
  templates: z.array(z.string()),
  endings: z.array(z.string()),
  images: z.array(z.string()).optional(),
});

/** Sections a Translation manifest may list, mirroring the base manifest. */
export const TRANSLATION_SECTIONS = [
  'locations',
  'scenes',
  'items',
  'enemies',
  'encounters',
  'templates',
  'endings',
  'images',
] as const;
export type TranslationSection = (typeof TRANSLATION_SECTIONS)[number];

/** Sections a Translation manifest must list. */
export const REQUIRED_TRANSLATION_SECTIONS: readonly TranslationSection[] = [
  'locations',
  'templates',
  'endings',
];

const translationConnectionSchema = z.strictObject({
  to: referenceSchema,
  label: textSchema.optional(),
});

/** One Location mapping: id, text fields and Connection labels keyed by `to`. */
export const TranslationLocationSchema = z.strictObject({
  id: idSchema,
  name: textSchema,
  description: narrationSchema,
  connections: z.array(translationConnectionSchema).default([]),
});

const translationOutcomeSchema = z.strictObject({
  text: narrationSchema.optional(),
});

const translationTestSchema = z.strictObject({
  success: translationOutcomeSchema,
  failure: translationOutcomeSchema,
});

const translationChoiceSchema = z.strictObject({
  id: idSchema,
  text: textSchema,
  outcome: translationOutcomeSchema.optional(),
  test: translationTestSchema.optional(),
});

/** One Scene mapping: id, text fields and Choices keyed by Choice `id`. */
export const TranslationSceneSchema = z.strictObject({
  id: idSchema,
  title: textSchema,
  text: narrationSchema,
  choices: z.array(translationChoiceSchema).default([]),
});

/** A named entry with an optional description: items, Enemies, Templates. */
const translationNamedEntrySchema = z.strictObject({
  id: idSchema,
  name: textSchema,
  description: textSchema.optional(),
});

export const TranslationItemsCatalogSchema = z.array(translationNamedEntrySchema);
export const TranslationEnemiesCatalogSchema = z.array(translationNamedEntrySchema);
export const TranslationTemplatesCatalogSchema = z.array(translationNamedEntrySchema);

/**
 * An Encounter entry alike in either base spelling (`enemy` or
 * `participants`): only the opening text and the Outcome texts.
 */
export const TranslationEncounterSchema = z.strictObject({
  id: idSchema,
  text: narrationSchema,
  victory: translationOutcomeSchema.optional(),
  escape: translationOutcomeSchema,
});
export const TranslationEncountersCatalogSchema = z.array(TranslationEncounterSchema);

export const TranslationEndingSchema = z.strictObject({
  id: idSchema,
  title: textSchema,
  text: narrationSchema,
});
export const TranslationEndingsCatalogSchema = z.array(TranslationEndingSchema);

export const TranslationImageSchema = z.strictObject({
  id: idSchema,
  alt: textSchema,
});
export const TranslationImagesCatalogSchema = z.array(TranslationImageSchema);
