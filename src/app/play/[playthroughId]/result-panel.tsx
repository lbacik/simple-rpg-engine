// The result panel after a Test or Outcome: the Test, the Outcome narration
// and the state changes of the latest step
// (docs/spec/playthrough-state.md, result panel).
//
// The Continue is a plain link to the same game page carrying the current
// `step` as `?seen=`. When it equals the Playthrough's current `step` the
// server renders the position without the panel; a value that does not match
// is ignored. With JavaScript the Link navigates softly with no full page
// reload; without JavaScript it degrades to a plain link navigation. Continue
// changes no game state and does not advance `step`: the Outcome was already
// applied when the Choice was made. There is no persisted "awaiting Continue"
// state: reloading without the parameter may show the panel again, harmlessly.

import Link from 'next/link';

export function ResultPanel({
  entries,
  continueHref,
  continueLabel,
  label,
}: {
  entries: string[];
  continueHref: string;
  /** Interface Text: the Continue button and the panel name, rendered by the game screen. */
  continueLabel: string;
  label: string;
}) {
  if (entries.length === 0) return null;
  // Entries hold server-rendered narration HTML (HTML-escaped, emphasis only).
  return (
    <section className="result" aria-label={label}>
      {entries.map((html, index) => (
        <div key={index} dangerouslySetInnerHTML={{ __html: html }} />
      ))}
      <p>
        <Link className="button" href={continueHref}>
          {continueLabel}
        </Link>
      </p>
    </section>
  );
}
