// The compiled, immutable Scenario model (docs/spec/architecture.md, engine
// contract; docs/spec/scenario-format.md, defaults).
//
// `buildScenario` runs once phases 1-3 produced no errors, so every reference
// resolves (the Integrity phase proved it). Zod parsing applies the Defaults
// table; object identities resolve the Location <-> Scene membership (in the
// listed order), Transitions, Encounter enemies, Template items and Scene
// illustrations. The result is deep-frozen, so engine and app code can share
// it without defensive copies.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { IntegrityImage, IntegrityMotionLayer } from './integrity';
import { normalizeListedPath } from './paths';
import {
  ConditionSchema,
  EffectSchema,
  EncountersCatalogSchema,
  EnemiesCatalogSchema,
  EndingsCatalogSchema,
  EnemySchema,
  EncounterSchema,
  EndingSchema,
  ImagesCatalogSchema,
  ItemSchema,
  ItemsCatalogSchema,
  LocationSchema,
  ManifestSchema,
  SceneSchema,
  TemplateSchema,
  TemplatesCatalogSchema,
} from './schema';
import type { ParsedFile } from './structure';

export type AttributeName = 'might' | 'agility' | 'wits' | 'presence';
export type CompiledCondition = z.infer<typeof ConditionSchema>;
export type CompiledEffect = z.infer<typeof EffectSchema>;
export type CompiledItem = z.infer<typeof ItemSchema>;
export type CompiledEnemy = z.infer<typeof EnemySchema>;
export type CompiledEnding = z.infer<typeof EndingSchema>;
export type CompiledImageEntry = IntegrityImage;

export type CompiledTemplateItem = {
  item: CompiledItem;
  quantity: number;
};

export type CompiledTemplate = Omit<z.infer<typeof TemplateSchema>, 'items'> & {
  items: CompiledTemplateItem[];
};

export type CompiledConnection = {
  to: CompiledLocation;
  /** The author's label, defaulting to the target Location's name. */
  label: string;
  when?: CompiledCondition;
};

export type CompiledLocation = {
  id: string;
  name: string;
  description: string;
  map?: { x: number; y: number };
  illustration?: CompiledImageEntry;
  /** The Location's Scenes in the listed (on-enter evaluation) order. */
  scenes: CompiledScene[];
  connections: CompiledConnection[];
};

export type CompiledOutcome = {
  text?: string;
  effects: CompiledEffect[];
  next?: CompiledScene;
  move?: CompiledLocation;
  startCombat?: CompiledEncounter;
  end?: CompiledEnding;
};

export type CompiledChoice = {
  id: string;
  text: string;
  when?: CompiledCondition;
  once: boolean;
  outcome?: CompiledOutcome;
  test?: {
    attribute: AttributeName;
    difficulty: 'easy' | 'ordinary' | 'hard' | 'very-hard';
    success: CompiledOutcome;
    failure: CompiledOutcome;
  };
};

export type CompiledScene = {
  id: string;
  title: string;
  trigger?: 'on-enter' | 'on-demand';
  repeatable: boolean;
  when?: CompiledCondition;
  illustration?: CompiledImageEntry;
  text: string;
  choices: CompiledChoice[];
  /** The listing Location, or undefined for follow-on Scenes. */
  location: CompiledLocation | undefined;
};

export type CompiledParticipant = {
  /** The participant's identity within its Encounter: explicit, or defaulted to its Enemy id. */
  id: string;
  enemy: CompiledEnemy;
};

export type CompiledEncounter = {
  id: string;
  /** The Encounter's participants in participant order (1-2 entries). */
  participants: CompiledParticipant[];
  startRange: 'near' | 'far';
  text: string;
  victory?: CompiledOutcome;
  escape: CompiledOutcome;
};

// ---------------------------------------------------------------------------
// Translations: accepted Translations' text, keyed for a later overlay ticket
// (docs/spec/scenario-format.md, Translation files; ADR 0002). Mechanics stay
// in the base only: these shapes carry text fields and the keys that say
// where they belong (`id`, Choice `id`, Connection `to`, Outcome nesting).
// ---------------------------------------------------------------------------

export type TranslationOutcomeText = {
  text?: string;
};

export type TranslationChoiceText = {
  id: string;
  text: string;
  outcome?: TranslationOutcomeText;
  test?: {
    success: TranslationOutcomeText;
    failure: TranslationOutcomeText;
  };
};

export type TranslationConnectionText = {
  to: string;
  label?: string;
};

export type TranslationLocationText = {
  id: string;
  name: string;
  description: string;
  connections: TranslationConnectionText[];
};

export type TranslationSceneText = {
  id: string;
  title: string;
  text: string;
  choices: TranslationChoiceText[];
};

/** An item, Enemy or Character Template entry: name plus optional description. */
export type TranslationNamedText = {
  id: string;
  name: string;
  description?: string;
};

export type TranslationEncounterText = {
  id: string;
  text: string;
  victory?: TranslationOutcomeText;
  escape: TranslationOutcomeText;
};

export type TranslationEndingText = {
  id: string;
  title: string;
  text: string;
};

export type TranslationImageText = {
  id: string;
  alt: string;
};

export type CompiledTranslation = {
  /** The Translation manifest's path, relative to the Scenario directory. */
  manifestPath: string;
  language: string;
  baseVersion: string;
  translator?: string;
  title: string;
  description: string;
  intro?: string;
  locations: Record<string, TranslationLocationText>;
  scenes: Record<string, TranslationSceneText>;
  items: Record<string, TranslationNamedText>;
  enemies: Record<string, TranslationNamedText>;
  encounters: Record<string, TranslationEncounterText>;
  templates: Record<string, TranslationNamedText>;
  endings: Record<string, TranslationEndingText>;
  images: Record<string, TranslationImageText>;
};

export type Scenario = {
  id: string;
  /** Absolute path of the Scenario directory. */
  dir: string;
  title: string;
  description: string;
  author?: string;
  version: string;
  language: string;
  intro?: string;
  startLocation: CompiledLocation;
  deathEnding: CompiledEnding;
  flags: string[];
  locations: CompiledLocation[];
  scenes: CompiledScene[];
  items: CompiledItem[];
  enemies: CompiledEnemy[];
  encounters: CompiledEncounter[];
  templates: CompiledTemplate[];
  endings: CompiledEnding[];
  images: CompiledImageEntry[];
  locationsById: Record<string, CompiledLocation>;
  scenesById: Record<string, CompiledScene>;
  itemsById: Record<string, CompiledItem>;
  enemiesById: Record<string, CompiledEnemy>;
  encountersById: Record<string, CompiledEncounter>;
  templatesById: Record<string, CompiledTemplate>;
  endingsById: Record<string, CompiledEnding>;
  imagesById: Record<string, CompiledImageEntry>;
  /** The accepted Translations, in base-manifest listing order. */
  translations: CompiledTranslation[];
  /** Deterministic SHA-256 over the manifest, every listed file and every image. */
  contentHash: string;
  /**
   * Manifest-relative paths of every listed content file, in manifest order:
   * the base files, then per Translation (accepted or rejected-but-readable)
   * its manifest and the files it lists. The dev registry watches these (plus
   * the manifest) for reloads, so editing a rejected Translation's files
   * reloads the Scenario on the next request.
   */
  listedPaths: string[];
};

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(`compiled model invariant broken: ${message}`);
  return value;
}

type Lookups = {
  scenes: Map<string, CompiledScene>;
  locations: Map<string, CompiledLocation>;
  encounters: Map<string, CompiledEncounter>;
  endings: Map<string, CompiledEnding>;
};

function resolveOutcome(
  parsed: z.infer<typeof EncounterSchema>['escape'],
  lookups: Lookups,
): CompiledOutcome {
  return {
    text: parsed.text,
    effects: parsed.effects,
    next: parsed.next === undefined ? undefined : required(lookups.scenes.get(parsed.next), `scene "${parsed.next}"`),
    move: parsed.move === undefined ? undefined : required(lookups.locations.get(parsed.move), `location "${parsed.move}"`),
    startCombat:
      parsed['start-combat'] === undefined
        ? undefined
        : required(lookups.encounters.get(parsed['start-combat']), `encounter "${parsed['start-combat']}"`),
    end: parsed.end === undefined ? undefined : required(lookups.endings.get(parsed.end), `ending "${parsed.end}"`),
  };
}

function resolveChoice(
  parsed: z.infer<typeof SceneSchema>['choices'][number],
  lookups: Lookups,
): CompiledChoice {
  return {
    id: parsed.id,
    text: parsed.text,
    when: parsed.when,
    once: parsed.once,
    outcome: parsed.outcome === undefined ? undefined : resolveOutcome(parsed.outcome, lookups),
    test:
      parsed.test === undefined
        ? undefined
        : {
            attribute: parsed.test.attribute,
            difficulty: parsed.test.difficulty,
            success: resolveOutcome(parsed.test.success, lookups),
            failure: resolveOutcome(parsed.test.failure, lookups),
          },
  };
}

export type TranslationModelInputs = {
  compiled: CompiledTranslation;
  /** The Translation manifest's path, relative to the Scenario directory. */
  manifestPath: string;
  manifestBytes: Buffer;
  /** The Translation's listed file paths in manifest order. */
  listedPaths: string[];
  /** Raw bytes of the manifest and every file it lists, keyed by listed path. */
  fileBytes: Map<string, Buffer>;
};

/**
 * The raw content of a Translation that T1 managed to read but a later stage
 * rejected. It carries no compiled text, but its bytes still feed the content
 * hash and the dev watch list: the author edits exactly these files to fix it.
 */
export type RejectedTranslationContent = Pick<
  TranslationModelInputs,
  'manifestPath' | 'manifestBytes' | 'listedPaths' | 'fileBytes'
>;

export type ModelInputs = {
  id: string;
  dir: string;
  manifest: ParsedFile;
  files: ParsedFile[];
  images: IntegrityImage[];
  imageBytes: Map<string, Buffer>;
  /** Raw bytes of every distinct Layer file, keyed by package path. */
  layerBytes: Map<string, Buffer>;
  manifestBytes: Buffer;
  /** Listed file paths in manifest order. */
  listedPaths: string[];
  /** Raw bytes of every listed file, keyed by listed path. */
  fileBytes: Map<string, Buffer>;
  /** Accepted Translations, in base-manifest listing order. */
  translations: TranslationModelInputs[];
  /**
   * Translations the pipelines rejected after T1 read them, in
   * base-manifest listing order. Only their bytes matter (hash, watch list).
   */
  rejectedTranslationContents: RejectedTranslationContent[];
};

/**
 * Compute the deterministic content hash: SHA-256 over the manifest bytes,
 * every listed file's bytes in manifest order, every listed Translation
 * manifest and every file it lists (accepted or rejected, so a
 * Translation-only change changes the hash), every declared image's bytes
 * in declaration order, and every distinct Layer file's bytes in
 * package-path order, each bound to its path. A file used as a Still and a
 * Layer, or as several Layers, counts once (its Still segment already covers
 * it); a file shared with another image counts in each image's own budget
 * but still hashes once.
 */
export function computeContentHash(
  inputs: Pick<
    ModelInputs,
    | 'images'
    | 'imageBytes'
    | 'layerBytes'
    | 'manifestBytes'
    | 'listedPaths'
    | 'fileBytes'
    | 'translations'
    | 'rejectedTranslationContents'
  >,
): string {
  const hash = createHash('sha256');
  const segment = (name: string, bytes: Buffer): void => {
    hash.update(name, 'utf8');
    hash.update(Buffer.from([0]));
    hash.update(bytes);
  };
  const segmentTranslation = (translation: TranslationModelInputs | RejectedTranslationContent): void => {
    segment(translation.manifestPath, translation.manifestBytes);
    for (const listedPath of translation.listedPaths) {
      segment(
        listedPath,
        required(translation.fileBytes.get(listedPath), `listed file "${listedPath}"`),
      );
    }
  };
  segment('scenario.yaml', inputs.manifestBytes);
  for (const listedPath of inputs.listedPaths) {
    segment(listedPath, required(inputs.fileBytes.get(listedPath), `listed file "${listedPath}"`));
  }
  for (const translation of inputs.translations) {
    segmentTranslation(translation);
  }
  for (const translation of inputs.rejectedTranslationContents) {
    segmentTranslation(translation);
  }
  for (const image of inputs.images) {
    segment(image.path, required(inputs.imageBytes.get(image.id), `image "${image.id}"`));
  }
  const stillPaths = new Set(inputs.images.map((image) => image.path));
  const layerPaths = [
    ...new Set(inputs.images.flatMap((image) => image.layers.map((file) => file.path))),
  ]
    .filter((layerPath) => !stillPaths.has(layerPath))
    .sort();
  for (const layerPath of layerPaths) {
    segment(layerPath, required(inputs.layerBytes.get(layerPath), `Layer file "${layerPath}"`));
  }
  return hash.digest('hex');
}

/** Recursively freeze the model, following shared and cyclic references once. */
export function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key], seen);
  }
  return Object.freeze(value);
}

/**
 * Build the compiled model. Call only when phases 1-3 produced no errors;
 * every lookup below is total because the Integrity phase proved it.
 */
export function buildScenario(inputs: ModelInputs): Scenario {
  const manifest = ManifestSchema.parse(inputs.manifest.value);
  const bySection = (section: ParsedFile['section']): ParsedFile[] =>
    inputs.files.filter((file) => file.section === section);

  const items = bySection('items').flatMap((file) => ItemsCatalogSchema.parse(file.value));
  const enemies = bySection('enemies').flatMap((file) => EnemiesCatalogSchema.parse(file.value));
  const endings = bySection('endings').flatMap((file) => EndingsCatalogSchema.parse(file.value));
  const parsedLocations = bySection('locations').map((file) => LocationSchema.parse(file.value));
  const parsedScenes = bySection('scenes').map((file) => SceneSchema.parse(file.value));
  const parsedEncounters = bySection('encounters').flatMap((file) =>
    EncountersCatalogSchema.parse(file.value),
  );
  const parsedTemplates = bySection('templates').flatMap((file) =>
    TemplatesCatalogSchema.parse(file.value),
  );
  const parsedImages = bySection('images').flatMap((file) => ImagesCatalogSchema.parse(file.value));

  const itemById = new Map(items.map((item) => [item.id, item]));
  const enemyById = new Map(enemies.map((enemy) => [enemy.id, enemy]));
  const endingById = new Map(endings.map((ending) => [ending.id, ending]));
  // Zod parsing applies the Motion defaults (anchor, width, blend); `at`
  // keeps no schema default (it excludes the future `drift`), so the model
  // centres it here. Phase 3 proved every Layer file, so the registry lookup
  // below is total.
  const parsedImageById = new Map(parsedImages.map((parsed) => [parsed.id, parsed]));
  const images: IntegrityImage[] = inputs.images.map((image) => {
    const parsed = required(parsedImageById.get(image.id), `image "${image.id}"`);
    if (parsed.motion === undefined) return image;
    const fileByPath = new Map(image.layers.map((file) => [file.path, file]));
    // The registry path is the normalized package path (integrity phase), so
    // an author spelling like `./glow.png` resolves to the same file entry.
    const layers: IntegrityMotionLayer[] = (parsed.motion.layers ?? []).map((layer) => {
      const layerPath = normalizeListedPath(layer.path);
      return {
        path: layerPath,
        at: layer.at ?? { x: 50, y: 50 },
        anchor: layer.anchor,
        width: layer.width,
        blend: layer.blend,
        file: required(fileByPath.get(layerPath), `Layer file "${layer.path}"`),
      };
    });
    return { ...image, motion: { layers } };
  });
  const imageById = new Map(images.map((image) => [image.id, image]));

  const locations: CompiledLocation[] = parsedLocations.map((parsed) => ({
    id: parsed.id,
    name: parsed.name,
    description: parsed.description,
    map: parsed.map,
    illustration:
      parsed.illustration === undefined
        ? undefined
        : required(imageById.get(parsed.illustration), `image "${parsed.illustration}"`),
    scenes: [],
    connections: [],
  }));
  const locationById = new Map(locations.map((location) => [location.id, location]));

  const scenes: CompiledScene[] = parsedScenes.map((parsed) => ({
    id: parsed.id,
    title: parsed.title,
    trigger: parsed.trigger,
    repeatable: parsed.repeatable,
    when: parsed.when,
    illustration:
      parsed.illustration === undefined
        ? undefined
        : required(imageById.get(parsed.illustration), `image "${parsed.illustration}"`),
    text: parsed.text,
    choices: [],
    location: undefined,
  }));
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));

  // `enemy: X` is shorthand for `participants: [{ enemy: X }]` (a single
  // participant with id `X`): both spellings normalise to the same ordered
  // participant model. Phase 3 proved exactly one spelling and every
  // reference, so the lookups below are total.
  const encounters: CompiledEncounter[] = parsedEncounters.map((parsed) => {
    const rawParticipants =
      parsed.participants !== undefined
        ? parsed.participants
        : parsed.enemy !== undefined
          ? [{ id: undefined as string | undefined, enemy: parsed.enemy }]
          : [];
    return {
      id: parsed.id,
      participants: rawParticipants.map((entry) => ({
        id: entry.id ?? entry.enemy,
        enemy: required(enemyById.get(entry.enemy), `enemy "${entry.enemy}"`),
      })),
      startRange: parsed.startRange,
      text: parsed.text,
      victory: undefined,
      escape: undefined as unknown as CompiledOutcome,
    };
  });
  const encounterById = new Map(encounters.map((encounter) => [encounter.id, encounter]));

  const lookups: Lookups = {
    scenes: sceneById,
    locations: locationById,
    encounters: encounterById,
    endings: endingById,
  };

  parsedLocations.forEach((parsed, locationIndex) => {
    const location = required(locations[locationIndex], `location index ${locationIndex}`);
    for (const sceneId of parsed.scenes) {
      const scene = required(sceneById.get(sceneId), `scene "${sceneId}"`);
      location.scenes.push(scene);
      if (scene.location === undefined) scene.location = location;
    }
    location.connections.push(
      ...parsed.connections.map((connection) => {
        const to = required(locationById.get(connection.to), `location "${connection.to}"`);
        return {
          to,
          label: connection.label ?? to.name,
          when: connection.when,
        };
      }),
    );
  });

  parsedScenes.forEach((parsed, sceneIndex) => {
    const scene = required(scenes[sceneIndex], `scene index ${sceneIndex}`);
    scene.choices.push(...parsed.choices.map((choice) => resolveChoice(choice, lookups)));
  });

  parsedEncounters.forEach((parsed, encounterIndex) => {
    const encounter = required(encounters[encounterIndex], `encounter index ${encounterIndex}`);
    encounter.victory =
      parsed.victory === undefined ? undefined : resolveOutcome(parsed.victory, lookups);
    encounter.escape = resolveOutcome(parsed.escape, lookups);
  });

  const templates: CompiledTemplate[] = parsedTemplates.map((parsed) => ({
    id: parsed.id,
    name: parsed.name,
    description: parsed.description,
    attributes: parsed.attributes,
    items: (parsed.items ?? []).map((entry) => ({
      item: required(itemById.get(entry.item), `item "${entry.item}"`),
      quantity: entry.quantity,
    })),
  }));

  const translationPaths = (translation: TranslationModelInputs | RejectedTranslationContent): string[] => [
    translation.manifestPath,
    ...translation.listedPaths,
  ];
  const listedPaths = [
    ...inputs.listedPaths,
    ...inputs.translations.flatMap(translationPaths),
    ...inputs.rejectedTranslationContents.flatMap(translationPaths),
  ];

  const scenario: Scenario = {
    id: inputs.id,
    dir: inputs.dir,
    title: manifest.title,
    description: manifest.description,
    author: manifest.author,
    version: manifest.version,
    language: manifest.language,
    intro: manifest.intro,
    startLocation: required(locationById.get(manifest.startLocation), `location "${manifest.startLocation}"`),
    deathEnding: required(endingById.get(manifest.deathEnding), `ending "${manifest.deathEnding}"`),
    flags: manifest.flags,
    locations,
    scenes,
    items,
    enemies,
    encounters,
    templates,
    endings,
    images,
    translations: inputs.translations.map((translation) => translation.compiled),
    locationsById: Object.fromEntries(locationById),
    scenesById: Object.fromEntries(sceneById),
    itemsById: Object.fromEntries(itemById),
    enemiesById: Object.fromEntries(enemies.map((enemy) => [enemy.id, enemy])),
    encountersById: Object.fromEntries(encounterById),
    templatesById: Object.fromEntries(templates.map((template) => [template.id, template])),
    endingsById: Object.fromEntries(endingById),
    imagesById: Object.fromEntries(imageById),
    contentHash: computeContentHash(inputs),
    listedPaths,
  };
  return deepFreeze(scenario);
}
