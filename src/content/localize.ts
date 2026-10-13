// Scenario text selection and overlay (docs/spec/scenario-format.md, language
// tags; docs/spec/ui.md, shared presentation; ADR 0002).
//
// For an Interface Language, a Scenario's text comes from the Translation
// whose primary language subtag equals it (`en-US` selects an `en`
// Translation). When the Base Language's primary subtag equals it, the base
// text is shown. Otherwise the base text is shown as the fallback. The engine
// never mixes the text of two languages within one Scenario: the overlay
// swaps every translatable field, so callers pass the localized Scenario to
// `startPlaythrough`, `applyAction` and `view` and the Journal records the
// shown language. Illustration `alt` follows the Translation; the images do
// not change.
//
// This module must stay free of Next.js, React and persistence imports
// (enforced by the no-restricted-imports rule in eslint.config.mjs).

import { INTERFACE_LANGUAGES, primaryLanguageSubtag } from '../i18n/languages';
import {
  deepFreeze,
  type CompiledChoice,
  type CompiledEncounter,
  type CompiledLocation,
  type CompiledOutcome,
  type CompiledScene,
  type CompiledTranslation,
  type Scenario,
  type TranslationChoiceText,
  type TranslationOutcomeText,
} from './model';

export type ScenarioTextSelection = {
  /** The Translation to show, or undefined for the base text. */
  translation: CompiledTranslation | undefined;
  /** The BCP 47 tag of the text shown: the Translation's or the Base Language. */
  shownLanguage: string;
  /** True when the Base Language is shown although it does not match. */
  fallback: boolean;
};

/**
 * Choose the text for an Interface Language: the Translation whose primary
 * language subtag equals it, the base text when the Base Language matches,
 * else the base text as the fallback.
 */
export function selectScenarioText(
  scenario: Scenario,
  interfaceLanguage: string,
): ScenarioTextSelection {
  const primary = primaryLanguageSubtag(interfaceLanguage);
  if (primaryLanguageSubtag(scenario.language) === primary) {
    return { translation: undefined, shownLanguage: scenario.language, fallback: false };
  }
  // A Translation into a language that is not an Interface Language is never
  // shown, so it is not selected either.
  const interfacePrimaries = new Set<string>(INTERFACE_LANGUAGES);
  if (!interfacePrimaries.has(primary)) {
    return { translation: undefined, shownLanguage: scenario.language, fallback: true };
  }
  const translation = scenario.translations.find(
    (candidate) => primaryLanguageSubtag(candidate.language) === primary,
  );
  if (translation === undefined) {
    return { translation: undefined, shownLanguage: scenario.language, fallback: true };
  }
  return { translation, shownLanguage: translation.language, fallback: false };
}

/**
 * The languages a Scenario can be shown in (docs/spec/ui.md, scenario language
 * flags): its Base Language first, then its Translations into Interface
 * Languages in manifest listing order. A Translation into any other language
 * is never shown, so it is not listed.
 */
export function displayLanguages(scenario: Scenario): string[] {
  const interfacePrimaries = new Set<string>(INTERFACE_LANGUAGES);
  return [
    scenario.language,
    ...scenario.translations
      .filter((translation) => interfacePrimaries.has(primaryLanguageSubtag(translation.language)))
      .map((translation) => translation.language),
  ];
}

export type LocalizedScenario = {
  /** The Scenario with every translatable field in the shown language. */
  scenario: Scenario;
  /** The BCP 47 tag of the text shown. */
  shownLanguage: string;
  /** True when the Base Language is shown although it does not match. */
  fallback: boolean;
  /** The Scenario's display languages: the Base Language first. */
  languages: string[];
};

/**
 * Resolve a Scenario into an Interface Language. When the Base Language
 * matches, or no Translation matches, the Scenario itself is returned;
 * otherwise a copy with the Translation overlaid is returned and the base
 * Scenario is left untouched.
 */
export function localizeScenario(
  scenario: Scenario,
  interfaceLanguage: string,
): LocalizedScenario {
  const selection = selectScenarioText(scenario, interfaceLanguage);
  const languages = displayLanguages(scenario);
  if (selection.translation === undefined) {
    return {
      scenario,
      shownLanguage: selection.shownLanguage,
      fallback: selection.fallback,
      languages,
    };
  }
  return {
    scenario: overlayTranslation(scenario, selection.translation),
    shownLanguage: selection.shownLanguage,
    fallback: false,
    languages,
  };
}

function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(`localized model invariant broken: ${message}`);
  return value;
}

type OverlayLookups = {
  locations: Map<string, CompiledLocation>;
  scenes: Map<string, CompiledScene>;
  encounters: Map<string, CompiledEncounter>;
};

function overlayOutcome(
  outcome: CompiledOutcome,
  text: TranslationOutcomeText | undefined,
  lookups: OverlayLookups,
  endingsById: Record<string, Scenario['endingsById'][string]>,
): CompiledOutcome {
  return {
    // A Translation is validated complete, but the overlay never erases
    // narration: a missing Translation field falls back to the base text.
    text: text?.text ?? outcome.text,
    effects: outcome.effects,
    next: outcome.next === undefined ? undefined : required(lookups.scenes.get(outcome.next.id), `scene "${outcome.next.id}"`),
    move:
      outcome.move === undefined
        ? undefined
        : required(lookups.locations.get(outcome.move.id), `location "${outcome.move.id}"`),
    startCombat:
      outcome.startCombat === undefined
        ? undefined
        : required(lookups.encounters.get(outcome.startCombat.id), `encounter "${outcome.startCombat.id}"`),
    end: outcome.end === undefined ? undefined : required(endingsById[outcome.end.id], `ending "${outcome.end.id}"`),
  };
}

function overlayChoice(
  choice: CompiledChoice,
  translated: TranslationChoiceText | undefined,
  lookups: OverlayLookups,
  endingsById: Record<string, Scenario['endingsById'][string]>,
): CompiledChoice {
  return {
    id: choice.id,
    text: translated?.text ?? choice.text,
    when: choice.when,
    once: choice.once,
    outcome:
      choice.outcome === undefined
        ? undefined
        : overlayOutcome(choice.outcome, translated?.outcome, lookups, endingsById),
    test:
      choice.test === undefined
        ? undefined
        : {
            attribute: choice.test.attribute,
            difficulty: choice.test.difficulty,
            success: overlayOutcome(
              choice.test.success,
              translated?.test?.success,
              lookups,
              endingsById,
            ),
            failure: overlayOutcome(
              choice.test.failure,
              translated?.test?.failure,
              lookups,
              endingsById,
            ),
          },
  };
}

/**
 * Copy the compiled model with a Translation's text overlaid. IDs,
 * references, Conditions, Effects, transitions, numbers, map coordinates and
 * illustrations stay in the base; only the translatable fields (including
 * image `alt`) are swapped, so the result reads in exactly one language.
 */
function overlayTranslation(scenario: Scenario, translation: CompiledTranslation): Scenario {
  const images = scenario.images.map((image) => ({
    ...image,
    alt: translation.images[image.id]?.alt ?? image.alt,
  }));
  const imageById = new Map(images.map((image) => [image.id, image]));

  const items = scenario.items.map((item) => {
    const translated = translation.items[item.id];
    return { ...item, name: translated?.name ?? item.name, description: translated?.description ?? item.description };
  });
  const itemById = new Map(items.map((item) => [item.id, item]));

  const enemies = scenario.enemies.map((enemy) => {
    const translated = translation.enemies[enemy.id];
    return { ...enemy, name: translated?.name ?? enemy.name, description: translated?.description ?? enemy.description };
  });
  const enemyById = new Map(enemies.map((enemy) => [enemy.id, enemy]));

  const endings = scenario.endings.map((ending) => {
    const translated = translation.endings[ending.id];
    return {
      ...ending,
      title: translated?.title ?? ending.title,
      text: translated?.text ?? ending.text,
    };
  });
  const endingById = new Map(endings.map((ending) => [ending.id, ending]));
  const endingsRecord = Object.fromEntries(endingById);

  const locations: CompiledLocation[] = scenario.locations.map((location) => {
    const translated = translation.locations[location.id];
    return {
      ...location,
      name: translated?.name ?? location.name,
      description: translated?.description ?? location.description,
      illustration:
        location.illustration === undefined
          ? undefined
          : required(imageById.get(location.illustration.id), `image "${location.illustration.id}"`),
      scenes: [] as CompiledScene[],
      connections: [] as CompiledLocation['connections'],
    };
  });
  const locationById = new Map(locations.map((location) => [location.id, location]));

  const scenes: CompiledScene[] = scenario.scenes.map((scene) => {
    const translated = translation.scenes[scene.id];
    return {
      ...scene,
      title: translated?.title ?? scene.title,
      text: translated?.text ?? scene.text,
      illustration:
        scene.illustration === undefined
          ? undefined
          : required(imageById.get(scene.illustration.id), `image "${scene.illustration.id}"`),
      choices: [] as CompiledChoice[],
      location: undefined as CompiledLocation | undefined,
    };
  });
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));

  const encounters: CompiledEncounter[] = scenario.encounters.map((encounter) => {
    const translated = translation.encounters[encounter.id];
    return {
      ...encounter,
      // Participants carry no text (docs/spec/scenario-format.md): only the
      // Enemy reference is re-pointed at the overlaid Enemy.
      participants: encounter.participants.map((participant) => ({
        id: participant.id,
        enemy: required(enemyById.get(participant.enemy.id), `enemy "${participant.enemy.id}"`),
      })),
      text: translated?.text ?? encounter.text,
      victory: undefined as CompiledOutcome | undefined,
      escape: undefined as unknown as CompiledOutcome,
    };
  });
  const encounterById = new Map(encounters.map((encounter) => [encounter.id, encounter]));

  const lookups: OverlayLookups = { locations: locationById, scenes: sceneById, encounters: encounterById };

  scenario.locations.forEach((base, index) => {
    const location = required(locations[index], `location index ${index}`);
    const translated = translation.locations[base.id];
    for (const baseScene of base.scenes) {
      const scene = required(sceneById.get(baseScene.id), `scene "${baseScene.id}"`);
      location.scenes.push(scene);
      if (scene.location === undefined) scene.location = location;
    }
    location.connections.push(
      ...base.connections.map((connection) => {
        const to = required(locationById.get(connection.to.id), `location "${connection.to.id}"`);
        return {
          to,
          // A Connection label the base omits defaults to the target
          // Location's name, so the overlay defaults to the translated name.
          label: translated?.connections.find((entry) => entry.to === connection.to.id)?.label ?? to.name,
          when: connection.when,
        };
      }),
    );
  });

  scenario.scenes.forEach((base, index) => {
    const scene = required(scenes[index], `scene index ${index}`);
    const translated = translation.scenes[base.id];
    scene.choices.push(
      ...base.choices.map((choice) =>
        overlayChoice(
          choice,
          translated?.choices.find((entry) => entry.id === choice.id),
          lookups,
          endingsRecord,
        ),
      ),
    );
  });

  scenario.encounters.forEach((base, index) => {
    const encounter = required(encounters[index], `encounter index ${index}`);
    const translated = translation.encounters[base.id];
    encounter.victory =
      base.victory === undefined ? undefined : overlayOutcome(base.victory, translated?.victory, lookups, endingsRecord);
    encounter.escape = overlayOutcome(base.escape, translated?.escape, lookups, endingsRecord);
  });

  const templates = scenario.templates.map((template) => {
    const translated = translation.templates[template.id];
    return {
      ...template,
      name: translated?.name ?? template.name,
      description: translated?.description ?? template.description,
      items: template.items.map((entry) => ({
        item: required(itemById.get(entry.item.id), `item "${entry.item.id}"`),
        quantity: entry.quantity,
      })),
    };
  });

  const localized: Scenario = {
    ...scenario,
    title: translation.title,
    description: translation.description,
    language: translation.language,
    intro: translation.intro,
    startLocation: required(locationById.get(scenario.startLocation.id), `location "${scenario.startLocation.id}"`),
    deathEnding: required(endingById.get(scenario.deathEnding.id), `ending "${scenario.deathEnding.id}"`),
    locations,
    scenes,
    items,
    enemies,
    encounters,
    templates,
    endings,
    images,
    locationsById: Object.fromEntries(locationById),
    scenesById: Object.fromEntries(sceneById),
    itemsById: Object.fromEntries(itemById),
    enemiesById: Object.fromEntries(enemyById),
    encountersById: Object.fromEntries(encounterById),
    templatesById: Object.fromEntries(templates.map((template) => [template.id, template])),
    endingsById: endingsRecord,
    imagesById: Object.fromEntries(imageById),
  };
  return deepFreeze(localized);
}
