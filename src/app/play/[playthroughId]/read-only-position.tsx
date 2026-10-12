// The read-only position of an incompatible Playthrough (docs/spec/ui.md,
// read-only Playthroughs): the same derived projection as play, rendered
// without any actions from the current content. The game screen and the tests
// render this directly.
//
// Relative imports only: vitest has no `@/` alias, and tests drive this
// module directly with react-dom/server.

import type { Scenario } from '../../../content/model';
import { renderNarration, renderStoredText, type GameView } from '../../../engine/index';
import type { PlaythroughState } from '../../../engine/state';
import { en, type Catalogue } from '../../../i18n/en';
import type { JournalEnding } from '../../lib/journal';
import { readOnlyGap } from '../../lib/playthrough';

/** An Ending block shared by the compatible and incompatible game screens. */
export function EndingBlock({
  kindLabel,
  title,
  html,
  lang,
  badge,
}: {
  /** The Ending kind, already rendered through the catalogue. */
  kindLabel: string;
  title: string;
  html: string;
  /** The language of the Ending text shown, when it comes from the Scenario. */
  lang?: string;
  /** The fallback badge, shown after the title while the Scenario falls back. */
  badge?: React.ReactNode;
}) {
  return (
    <>
      <p className="meta">{kindLabel}</p>
      <h1>
        {lang === undefined ? title : <span lang={lang}>{title}</span>}
        {badge === undefined ? null : <> {badge}</>}
      </h1>
      {lang === undefined ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div lang={lang} dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </>
  );
}

/**
 * The current position of an incompatible Playthrough, without any actions:
 * the same derived projection, rendered read-only from the current content.
 * Content whose id is gone from the Scenario is left out with a short notice
 * instead of the fallback `view()` supplies for compatible play.
 */
export function ReadOnlyPosition({
  scenario,
  state,
  gameView,
  characterName,
  recordedEnding,
  catalogue = en,
  lang,
  badge,
}: {
  scenario: Scenario;
  state: PlaythroughState;
  gameView: GameView;
  characterName: string;
  recordedEnding: JournalEnding | undefined;
  /** Interface Text: the game screen passes the current catalogue. */
  catalogue?: Catalogue;
  /** The language of the Scenario text shown. */
  lang: string;
  /** The fallback badge, shown after the title while the Scenario falls back. */
  badge?: React.ReactNode;
}) {
  const gap = readOnlyGap(scenario, state, gameView.kind, recordedEnding !== undefined);
  if (gap === 'location') {
    return <p className="meta">{catalogue.game.locationGone}</p>;
  }
  if (gap === 'ending') {
    return <p className="meta">{catalogue.game.endingGone}</p>;
  }
  if (gameView.kind === 'location') {
    return (
      <>
        <h1>
          <span lang={lang}>{gameView.name}</span>
          {badge === undefined ? null : <> {badge}</>}
        </h1>
        {/* Location description: rendered narration subset. */}
        <div
          lang={lang}
          dangerouslySetInnerHTML={{ __html: renderNarration(gameView.description, characterName) }}
        />
      </>
    );
  }
  if (gameView.kind === 'scene') {
    return (
      <>
        <h1>
          <span lang={lang}>{gameView.title}</span>
          {badge === undefined ? null : <> {badge}</>}
        </h1>
        <div
          lang={lang}
          dangerouslySetInnerHTML={{
            __html: renderNarration(gameView.text, gameView.characterName),
          }}
        />
      </>
    );
  }
  if (gameView.kind === 'combat') {
    return (
      <>
        <h1>
          <span lang={lang}>{gameView.encounterName}</span>
          {badge === undefined ? null : <> {badge}</>}
        </h1>
        <div
          lang={lang}
          dangerouslySetInnerHTML={{
            __html: renderNarration(gameView.text, gameView.characterName),
          }}
        />
        <section aria-label={catalogue.readOnly.combat}>
          <p className="meta">
            {catalogue.readOnly.roundRange(gameView.round, catalogue.range[gameView.range])}
          </p>
          <p className="meta">
            {catalogue.readOnly.health(
              characterName,
              gameView.character.health,
              gameView.character.maxHealth,
              gameView.enemy.name,
              gameView.enemy.health,
              gameView.enemy.maxHealth,
            )}
          </p>
        </section>
      </>
    );
  }
  // Ended: when the content Ending is gone, read it from its Journal entry.
  const contentEndingGone =
    state.endingId !== undefined && scenario.endingsById[state.endingId] === undefined;
  if (contentEndingGone && recordedEnding) {
    // The Ending comes from its Journal entry as presented, with its own
    // recorded language: never the fallback badge.
    return (
      <EndingBlock
        kindLabel={catalogue.ending[recordedEnding.kind]}
        title={recordedEnding.title}
        html={renderStoredText(recordedEnding.text, characterName)}
        lang={recordedEnding.lang}
      />
    );
  }
  return (
    <EndingBlock
      kindLabel={catalogue.ending[gameView.endingKind]}
      title={gameView.title}
      html={renderNarration(gameView.text, characterName)}
      lang={lang}
      badge={badge}
    />
  );
}
