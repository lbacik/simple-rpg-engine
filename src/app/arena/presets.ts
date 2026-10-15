// The Arena Character presets (issue #168): quick starting points copied from
// the Character Templates of the shipped Scenarios. Names are localized into
// the Interface Language; Attributes travel unchanged and Health starts full.
// Server-only: it reads the Scenario registry straight from disk, so the
// Client setup form receives plain preset data as props.

import { listScenarios, localizeScenario } from '../../content/index';
import { MAX_HEALTH } from '../../engine/state';
import type { InterfaceLanguage } from '../../i18n/index';

export type ArenaPreset = {
  /** Unique across Scenarios: `${scenarioId}/${templateId}`. */
  id: string;
  /** The Template name in the Interface Language. */
  name: string;
  /** The Scenario title in the Interface Language. */
  scenarioName: string;
  attributes: { might: number; agility: number; wits: number; presence: number };
  health: number;
};

/**
 * Every Character Template of every shipped Scenario, in Scenario then
 * Template order. Empty only when no Scenario loaded.
 */
export function getArenaPresets(language: InterfaceLanguage): ArenaPreset[] {
  const presets: ArenaPreset[] = [];
  for (const scenario of listScenarios()) {
    const localized = localizeScenario(scenario, language);
    for (const template of localized.scenario.templates) {
      presets.push({
        id: `${scenario.id}/${template.id}`,
        name: template.name,
        scenarioName: localized.scenario.title,
        attributes: { ...template.attributes },
        health: MAX_HEALTH,
      });
    }
  }
  return presets;
}
