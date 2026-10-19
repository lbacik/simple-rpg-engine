// Illustration Motion timeline freeze (issue #221): while no part of the
// Illustration is in the viewport, or the tab is hidden, the shared timeline
// clock freezes the fade-in and every timeline-driven primitive (frames,
// Drift, Flicker, Camera) and resumes where it stopped. See
// docs/spec/ui.md (Timeline, Off-screen and hidden tab).

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  MotionLayer,
  pauseTimelineAnimations,
  rectInViewport,
  resumeTimelineAnimations,
  timelineFrozen,
} from '../src/app/play/[playthroughId]/illustration';

type FakeAnimation = {
  playState: Animation['playState'];
  paused: number;
  played: number;
  pause: () => void;
  play: () => void;
};

function fakeAnimation(playState: Animation['playState']): FakeAnimation {
  const animation: FakeAnimation = {
    playState,
    paused: 0,
    played: 0,
    pause: () => {
      animation.paused += 1;
    },
    play: () => {
      animation.played += 1;
    },
  };
  return animation;
}

describe('timeline freeze', () => {
  it('runs while the Illustration is visible and the tab is shown', () => {
    expect(timelineFrozen({ inViewport: true, tabHidden: false })).toBe(false);
  });

  it('freezes when no part of the Illustration is in the viewport', () => {
    expect(timelineFrozen({ inViewport: false, tabHidden: false })).toBe(true);
  });

  it('freezes when the tab is hidden', () => {
    expect(timelineFrozen({ inViewport: true, tabHidden: true })).toBe(true);
  });

  it('freezes when both off-screen and hidden', () => {
    expect(timelineFrozen({ inViewport: false, tabHidden: true })).toBe(true);
  });

  it('counts any visible pixel as in the viewport', () => {
    const viewport = { width: 800, height: 600 };
    expect(rectInViewport({ top: 100, bottom: 300, left: 100, right: 300 }, viewport)).toBe(true);
    // One pixel over the edge still shows.
    expect(rectInViewport({ top: -99, bottom: 1, left: 100, right: 300 }, viewport)).toBe(true);
    expect(rectInViewport({ top: 100, bottom: 300, left: 799, right: 900 }, viewport)).toBe(true);
  });

  it('counts a fully out-of-view box as off-screen', () => {
    const viewport = { width: 800, height: 600 };
    expect(rectInViewport({ top: -200, bottom: 0, left: 100, right: 300 }, viewport)).toBe(false);
    expect(rectInViewport({ top: 600, bottom: 800, left: 100, right: 300 }, viewport)).toBe(false);
    expect(rectInViewport({ top: 100, bottom: 300, left: -200, right: 0 }, viewport)).toBe(false);
    expect(rectInViewport({ top: 100, bottom: 300, left: 800, right: 1000 }, viewport)).toBe(false);
  });

  it('pauses running animations but leaves finished one-shots at their end state', () => {
    const running = fakeAnimation('running');
    const idle = fakeAnimation('idle');
    const paused = fakeAnimation('paused');
    const finished = fakeAnimation('finished');
    pauseTimelineAnimations([running, idle, paused, finished]);
    expect(running.paused).toBe(1);
    expect(idle.paused).toBe(1);
    expect(paused.paused).toBe(1);
    // A finished one-shot already holds its end framing; pausing it must not
    // disturb the end state.
    expect(finished.paused).toBe(0);
  });

  it('resumes paused animations without restarting finished one-shots', () => {
    const paused = fakeAnimation('paused');
    const running = fakeAnimation('running');
    const finished = fakeAnimation('finished');
    resumeTimelineAnimations([paused, running, finished]);
    expect(paused.played).toBe(1);
    // Playing a finished one-shot would replay it from the start instead of
    // holding its end state; playing a running one is a needless prod.
    expect(running.played).toBe(0);
    expect(finished.played).toBe(0);
  });

  it('tolerates animations that throw on pause or play', () => {
    const failing = {
      playState: 'running' as const,
      pause: () => {
        throw new Error('already finished');
      },
      play: () => {
        throw new Error('never started');
      },
    };
    expect(() => pauseTimelineAnimations([failing])).not.toThrow();
    expect(() =>
      resumeTimelineAnimations([{ ...failing, playState: 'paused' as const }]),
    ).not.toThrow();
  });

  it('pauses nothing and resumes nothing when there are no animations', () => {
    expect(() => pauseTimelineAnimations([])).not.toThrow();
    expect(() => resumeTimelineAnimations([])).not.toThrow();
  });

  it('freezes a sprite strip in place while keeping its frames mounted', () => {
    const still = { width: 640, height: 360 };
    const strip = {
      src: '/scenarios/demo/assets/abc/images/layers/flame.png',
      at: { x: 50, y: 50 },
      anchor: { x: 50, y: 50 },
      width: 50,
      frames: 8,
      fps: 4,
      blend: 'normal' as const,
      pixelWidth: 8,
      pixelHeight: 4,
    };
    const running = renderToStaticMarkup(<MotionLayer layer={strip} still={still} index={0} />);
    expect(running).toContain('animation:illustration-sprite-step 2s steps(8) infinite');
    expect(running).not.toContain('animation-play-state');
    // Freezing pauses the stepping but never unmounts the strip: the frames
    // stay, with the same animation, held where they stopped.
    const frozen = renderToStaticMarkup(
      <MotionLayer layer={strip} still={still} index={0} timelinePaused />,
    );
    expect(frozen).toContain('animation:illustration-sprite-step 2s steps(8) infinite');
    expect(frozen).toContain('animation-play-state:paused');
  });
});
