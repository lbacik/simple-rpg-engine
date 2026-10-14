// THROWAWAY: three light game-screen layouts on the existing /play/[id]
// route via ?variant=A|B|C. Question: which hierarchy suits illustrated play?
import { effectiveAttributes, renderNarration, sceneIllustrationUrl, type GameView } from '@/engine/index';
import type { PlaythroughState } from '@/engine/state';
import type { Scenario } from '@/content/model';
import type { Catalogue } from '@/i18n/index';
import type { StoredJournalEntry } from '@/app/lib/journal';
import { modalJournalBatch } from '@/app/lib/journal';
import { GameUiPrototype } from './ui-prototype-client';

export function UiPrototype({ scenario, state, gameView, journal, playthroughId, catalogue, variant, demo = false }: {
  scenario: Scenario; state: PlaythroughState; gameView: GameView;
  journal: StoredJournalEntry[]; playthroughId: string; catalogue: Catalogue;
  variant: string; demo?: boolean;
}) {
  const pl = catalogue.code === 'pl';
  const location = scenario.locationsById[state.currentLocationId];
  const title = gameView.kind === 'location' ? gameView.name : gameView.kind === 'combat' ? gameView.encounterName : gameView.title;
  const narration = gameView.kind === 'location' ? gameView.description : gameView.text;
  const image = gameView.kind !== 'ended' && gameView.kind !== 'combat' ? gameView.illustration : undefined;
  const fallbackImage = location?.illustration;
  const illustration = image ?? (fallbackImage ? { src: sceneIllustrationUrl(scenario.id, fallbackImage), alt: fallbackImage.alt } : undefined);
  const choices = gameView.kind === 'scene' ? gameView.choices.map((choice) => ({
    id: choice.id, text: choice.text,
    detail: choice.test ? catalogue.game.testLabel(catalogue.attributes[choice.test.attribute], catalogue.difficulty[choice.test.difficulty], choice.test.target) : '',
  })) : gameView.kind === 'location' ? [
    ...gameView.onDemandScenes.map((scene) => ({ id: scene.sceneId, text: scene.title, detail: catalogue.game.scenes })),
    ...gameView.exits.map((exit) => ({ id: exit.targetLocationId, text: exit.label, detail: catalogue.game.exits })),
  ] : [{ id: 'continue', text: catalogue.game.continue, detail: '' }];
  return <GameUiPrototype variant={variant} data={{
    playthroughId, demo, scenarioTitle: scenario.title, title, location: location?.name ?? title,
    lang: scenario.language, html: renderNarration(narration, state.character.name), illustration,
    choices, map: gameView.map, character: {
      name: state.character.name, template: scenario.templatesById[state.character.templateId]?.name ?? '',
      health: state.character.health,
      attributes: Object.entries(effectiveAttributes(scenario, state)).map(([id, value]) => ({ id, value, label: catalogue.attributes[id as keyof typeof catalogue.attributes] })),
    },
    items: Object.entries(state.inventory).map(([id, quantity]) => ({ id, quantity,
      name: scenario.itemsById[id]?.name ?? id, description: scenario.itemsById[id]?.description ?? '',
      equipped: Object.values(state.equipment).includes(id),
    })),
    journal: modalJournalBatch(journal, catalogue, state.character.name),
    state: { kind: gameView.kind, step: state.step, status: state.status, location: state.currentLocationId, scene: state.activeSceneId, health: state.character.health, visited: state.visited, flags: state.flags },
    text: {
      character: catalogue.character.title, inventory: catalogue.inventory.title, journal: catalogue.journal.title,
      map: catalogue.map.title, health: catalogue.character.health, choices: catalogue.game.choices,
      close: catalogue.journal.close, equipped: catalogue.inventory.equipped,
      prototype: pl ? 'Prototyp interfejsu' : 'UI prototype',
      variants: pl ? ['Ilustrowana kronika', 'Atlas podróży', 'Scena i decyzje'] : ['Illustrated chronicle', 'Travel atlas', 'Scene & decisions'],
      descriptions: pl ? ['Opowieść w centrum. Mapa i postać zawsze pod ręką.', 'Świat w centrum. Opowieść towarzyszy podróży.', 'Ilustracja w centrum. Wszystkie decyzje po prawej.'] : ['Story first. Map and character always within reach.', 'World first. The story travels alongside you.', 'Illustration first. Every decision on the right.'],
      adventure: pl ? 'Twoja przygoda' : 'Your adventure',
      chapter: pl ? 'Bieżąca scena' : 'Current scene',
      journey: pl ? 'Odkryty świat' : 'Discovered world',
      here: pl ? 'Jesteś tutaj' : 'You are here',
      decide: pl ? 'Co robisz dalej?' : 'What do you do next?',
      entries: catalogue.journal.total(journal.length),
      prev: pl ? 'Poprzedni wariant' : 'Previous variant', next: pl ? 'Następny wariant' : 'Next variant',
      preview: pl ? 'Podgląd wyboru — rozgrywka nie została zmieniona.' : 'Choice preview — the Playthrough was not changed.',
      hint: pl ? 'Wybory w tym prototypie służą wyłącznie do podglądu.' : 'Choices in this prototype are for preview only.',
      state: pl ? 'Stan podglądu' : 'Preview state',
      demo: pl ? 'Przykładowa rozgrywka w pamięci' : 'Example Playthrough in memory',
      live: pl ? 'Podgląd aktualnej rozgrywki' : 'Current Playthrough preview',
      original: pl ? 'Aktualny interfejs' : 'Current interface',
      noImage: pl ? 'Ta scena nie ma ilustracji' : 'This scene has no illustration',
    },
  }} />;
}
