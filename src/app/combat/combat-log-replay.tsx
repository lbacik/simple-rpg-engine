// The Combat log replay (Combat MVP 1.0, P4 U5): the only client piece of the
// log. All wording arrives as props — Client Components never import the
// catalogue — and the first render matches the server markup exactly: the
// full Round with no controls. After hydration the viewer can replay the
// Round step by step (one step per beat, a manual Next step) or skip to the
// full list. With reduced motion the replay reveals the whole Round at once.

'use client';

import { useEffect, useState } from 'react';

const REPLAY_BEAT_MS = 700;

export interface CombatLogReplayProps {
  /** The Round's pre-rendered, localised lines (server owns the catalogue). */
  lines: string[];
  replayLabel: string;
  nextLabel: string;
  pauseLabel: string;
  skipLabel: string;
  /** stepLabels[i] names lines[i + 1], e.g. "Step 3 of 7". */
  stepLabels: string[];
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function CombatLogReplay(props: CombatLogReplayProps) {
  const { lines } = props;
  // Progressive enhancement: controls appear only after hydration, so the
  // server and no-JavaScript renders show the full log with no dead buttons.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  // shown === null means the full Round; otherwise the first `shown` lines.
  const [shown, setShown] = useState<number | null>(null);
  // Pausing stops the beat; the viewer keeps stepping manually with Next.
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (shown === null || paused || shown >= lines.length) return;
    const timer = window.setTimeout(() => setShown(shown + 1), REPLAY_BEAT_MS);
    return () => window.clearTimeout(timer);
  }, [shown, paused, lines.length]);

  function startReplay(): void {
    // Reduced motion honoured: the whole Round reveals at once, no stepping.
    setPaused(false);
    setShown(prefersReducedMotion() ? lines.length : 1);
  }

  const replaying = shown !== null;
  const visible = replaying ? shown : lines.length;

  return (
    <>
      {mounted && lines.length > 1 ? (
        <div className="combat-log-controls">
          {replaying ? (
            <>
              <p className="cp-dim" role="status" aria-live="polite">
                {props.stepLabels[Math.min(visible, lines.length) - 1]}
              </p>
              {visible < lines.length ? (
                <>
                  <button type="button" onClick={() => setShown(visible + 1)}>
                    {props.nextLabel}
                  </button>
                  {paused ? null : (
                    <button type="button" onClick={() => setPaused(true)}>
                      {props.pauseLabel}
                    </button>
                  )}
                </>
              ) : null}
              <button type="button" onClick={() => setShown(null)}>
                {props.skipLabel}
              </button>
            </>
          ) : (
            <button type="button" onClick={startReplay}>
              {props.replayLabel}
            </button>
          )}
        </div>
      ) : null}
      <ol>
        {lines.map((line, index) => (
          <li key={index} style={replaying && index >= visible ? { display: 'none' } : undefined}>
            {line}
          </li>
        ))}
      </ol>
    </>
  );
}
