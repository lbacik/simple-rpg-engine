// The result panel after a Test or Outcome: the Test, the Outcome narration
// and the state changes of the latest step
// (docs/spec/playthrough-state.md, result panel).
//
// The Continue is client-side only: the Outcome was already applied when the
// Choice was made, so dismissing only hides the panel and reveals the new
// position below. Without JavaScript the panel stays visible above it.

'use client';

import { useState } from 'react';

export function ResultPanel({ entries }: { entries: string[] }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || entries.length === 0) return null;
  // Entries hold server-rendered narration HTML (HTML-escaped, emphasis only).
  return (
    <section className="result" aria-label="Latest events">
      {entries.map((html, index) => (
        <div key={index} dangerouslySetInnerHTML={{ __html: html }} />
      ))}
      <p>
        <button className="button" type="button" onClick={() => setDismissed(true)}>
          Continue
        </button>
      </p>
    </section>
  );
}
