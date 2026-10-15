// The Arena setup form: a Client Component, so every word it shows arrives
// as rendered strings in `strings`, `enemies` and `fighter`, and the start
// errors arrive from the Server Action already rendered in the language
// current when they are shown. No catalogue is imported here.

'use client';

import { useActionState } from 'react';
import { startArenaFight, type ArenaStartState } from './actions';

export type ArenaEnemyOption = {
  id: string;
  name: string;
  description: string | undefined;
  stats: string;
};

export type ArenaFighterFacts = {
  name: string;
  description: string | undefined;
  stats: string;
  items: string[];
};

export default function ArenaStartForm({
  enemies,
  fighter,
  lang,
  strings,
}: {
  enemies: ArenaEnemyOption[];
  fighter: ArenaFighterFacts;
  /** The language of the Scenario names shown. */
  lang: string;
  strings: {
    chooseOpponent: string;
    fighter: string;
    start: string;
    starting: string;
  };
}) {
  const [state, action, pending] = useActionState<ArenaStartState, FormData>(startArenaFight, {});
  return (
    <form action={action}>
      <fieldset>
        <legend>{strings.chooseOpponent}</legend>
        {enemies.map((enemy, index) => (
          <p key={enemy.id}>
            <label>
              <input
                type="radio"
                name="enemy"
                value={enemy.id}
                defaultChecked={index === 0}
                required
              />{' '}
              <strong lang={lang}>{enemy.name}</strong>
            </label>
            {enemy.description ? (
              <>
                {' '}
                <span lang={lang}>{enemy.description}</span>
              </>
            ) : null}{' '}
            <span className="meta">{enemy.stats}</span>
          </p>
        ))}
      </fieldset>
      <section aria-label={strings.fighter}>
        <h2>{strings.fighter}</h2>
        <p>
          <strong lang={lang}>{fighter.name}</strong>
          {fighter.description ? (
            <>
              {' '}
              <span lang={lang}>{fighter.description}</span>
            </>
          ) : null}
        </p>
        <p className="meta">{fighter.stats}</p>
        {fighter.items.length > 0 ? (
          <ul>
            {fighter.items.map((item) => (
              <li key={item} lang={lang}>
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      {state.error ? (
        <p className="error" role="alert">
          {state.error}
        </p>
      ) : null}
      <p>
        <button className="button" type="submit" disabled={pending}>
          {pending ? strings.starting : strings.start}
        </button>
      </p>
    </form>
  );
}
