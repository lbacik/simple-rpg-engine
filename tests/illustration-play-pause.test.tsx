// Illustration Play/Pause control and the global Motion preference (issue
// #220): one engine-provided button per Illustration with Motion, a
// `localStorage` preference winning over the OS `prefers-reduced-motion`
// setting, and the Pause/Play timeline semantics. See docs/spec/ui.md
// (Play/Pause control and reduced motion, Timeline, Loading and failure,
// Interface Text).

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Illustration } from '../src/app/play/[playthroughId]/illustration';
import {
  MOTION_STORAGE_KEY,
  motionControlState,
  readStoredMotionChoice,
  resolveMotionOn,
  writeStoredMotionChoice,
  type MotionChoice,
  type MotionStorage,
} from '../src/app/play/[playthroughId]/motion-preference';
import { en } from '../src/i18n/en';
import { pl } from '../src/i18n/pl';

function memoryStorage(initial: Record<string, string> = {}): MotionStorage & {
  dump: Record<string, string>;
} {
  const dump: Record<string, string> = { ...initial };
  return {
    dump,
    getItem: (key: string): string | null =>
      Object.hasOwn(dump, key) ? (dump[key] as string) : null,
    setItem: (key: string, value: string): void => {
      dump[key] = value;
    },
  };
}

function throwingStorage(): MotionStorage {
  return {
    getItem: (): string | null => {
      throw new Error('storage unavailable');
    },
    setItem: (): void => {
      throw new Error('storage unavailable');
    },
  };
}

const layers = [
  {
    src: '/scenarios/demo/assets/abc/images/layers/gleam.png',
    at: { x: 50, y: 50 },
    anchor: { x: 50, y: 50 },
    width: 100,
    blend: 'normal' as const,
    pixelWidth: 8,
    pixelHeight: 4,
  },
];

describe('motion interface text', () => {
  it('names the control "Pause animation" and "Play animation" in English', () => {
    expect(en.illustration.pauseAnimation).toBe('Pause animation');
    expect(en.illustration.playAnimation).toBe('Play animation');
  });

  it('names the control in Polish', () => {
    expect(pl.illustration.pauseAnimation).toBe('Wstrzymaj animację');
    expect(pl.illustration.playAnimation).toBe('Odtwórz animację');
  });
});

describe('stored motion choice', () => {
  it('uses a dedicated localStorage key', () => {
    expect(MOTION_STORAGE_KEY).toBe('rpg-illustration-motion');
  });

  it('reads an explicit choice back', () => {
    expect(readStoredMotionChoice(memoryStorage({ [MOTION_STORAGE_KEY]: 'on' }))).toBe('on');
    expect(readStoredMotionChoice(memoryStorage({ [MOTION_STORAGE_KEY]: 'off' }))).toBe('off');
  });

  it('reads null when storage is empty', () => {
    expect(readStoredMotionChoice(memoryStorage())).toBeNull();
  });

  it('reads null for an unknown stored value', () => {
    expect(readStoredMotionChoice(memoryStorage({ [MOTION_STORAGE_KEY]: 'yes' }))).toBeNull();
  });

  it('reads null without errors when storage is unavailable', () => {
    expect(readStoredMotionChoice(throwingStorage())).toBeNull();
    expect(readStoredMotionChoice(null)).toBeNull();
    expect(readStoredMotionChoice(undefined)).toBeNull();
  });

  it('writes the choice without errors, even when storage is unavailable', () => {
    const storage = memoryStorage();
    const choice: MotionChoice = 'off';
    writeStoredMotionChoice(storage, choice);
    expect(storage.dump[MOTION_STORAGE_KEY]).toBe('off');
    expect(() => writeStoredMotionChoice(throwingStorage(), 'on')).not.toThrow();
    expect(() => writeStoredMotionChoice(null, 'on')).not.toThrow();
  });
});

describe('motion preference precedence', () => {
  it('lets an explicit choice win in both directions', () => {
    // Stored Play beats an OS asking for reduced motion.
    expect(resolveMotionOn('on', true)).toBe(true);
    // Stored Pause beats an OS without reduced motion.
    expect(resolveMotionOn('off', false)).toBe(false);
  });

  it('falls back to the OS setting without a stored choice', () => {
    expect(resolveMotionOn(null, true)).toBe(false);
    expect(resolveMotionOn(null, false)).toBe(true);
  });
});

describe('motion control state', () => {
  it('shows Pause while Motion is on', () => {
    expect(
      motionControlState({ hasMotion: true, hydrated: true, failed: false, motionOn: true, refused: false }),
    ).toBe('pause');
  });

  it('shows Play while Motion is off', () => {
    expect(
      motionControlState({ hasMotion: true, hydrated: true, failed: false, motionOn: false, refused: false }),
    ).toBe('play');
  });

  it('shows Play after the browser refuses to animate', () => {
    expect(
      motionControlState({ hasMotion: true, hydrated: true, failed: false, motionOn: true, refused: true }),
    ).toBe('play');
  });

  it('hides after a failure', () => {
    expect(
      motionControlState({ hasMotion: true, hydrated: true, failed: true, motionOn: true, refused: false }),
    ).toBeNull();
  });

  it('never renders without Motion or before hydration', () => {
    expect(
      motionControlState({ hasMotion: false, hydrated: true, failed: false, motionOn: true, refused: false }),
    ).toBeNull();
    expect(
      motionControlState({ hasMotion: true, hydrated: false, failed: false, motionOn: true, refused: false }),
    ).toBeNull();
  });
});

describe('illustration control markup', () => {
  it('server-renders no control even for an Illustration with Motion', () => {
    const html = renderToStaticMarkup(
      <Illustration
        src="/scenarios/demo/assets/def/images/gate.png"
        width={640}
        height={360}
        alt="An old gate."
        layers={layers}
        showingKey="location:home"
        pauseAnimationLabel="Pause animation"
        playAnimationLabel="Play animation"
      />,
    );
    expect(html).not.toContain('<button');
    expect(html).not.toContain('Pause animation');
    expect(html).not.toContain('Play animation');
  });

  it('server-renders no control without Motion', () => {
    const html = renderToStaticMarkup(
      <Illustration src="/s.png" width={10} height={5} alt="A gate." />,
    );
    expect(html).not.toContain('<button');
  });
});
