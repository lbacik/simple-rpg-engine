// The global Illustration Motion preference (docs/spec/ui.md, play/pause
// control and reduced motion): one choice for every Illustration, kept in
// `localStorage` per browser and device, never with the Session or the
// Playthrough. An explicit choice from the control wins in both directions;
// without one, the OS `prefers-reduced-motion` setting decides. The
// preference governs Illustration Motion only.
//
// Pure over injected storage and settings, so the precedence chain is
// testable without hydration. The component reads the browser's storage and
// media query and keeps them here.

/** The `localStorage` key holding the player's explicit Motion choice. */
export const MOTION_STORAGE_KEY = 'rpg-illustration-motion';

/** The player's explicit choice: Motion on (Play) or off (Pause). */
export type MotionChoice = 'on' | 'off';

/** A stored choice, or null when storage is unavailable, empty or unknown. */
export type StoredMotionChoice = MotionChoice | null;

/** The smallest storage surface the preference needs; `window.localStorage` in production. */
export type MotionStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/**
 * The stored choice, or null when there is none: storage unavailable (its
 * `getItem` throws, or no storage at all), the key missing, or a value the
 * engine never wrote. Never throws: when storage is unavailable the OS
 * setting decides (docs/spec/ui.md, persistence).
 */
export function readStoredMotionChoice(storage: MotionStorage | null | undefined): StoredMotionChoice {
  try {
    const stored = storage?.getItem(MOTION_STORAGE_KEY) ?? null;
    if (stored === 'on' || stored === 'off') return stored;
    return null;
  } catch {
    return null;
  }
}

/**
 * Keeps an explicit choice from the control. Never throws and never stores
 * anything else: a refusal to animate is not a choice and is never written
 * (docs/spec/ui.md, the browser refuses to animate).
 */
export function writeStoredMotionChoice(
  storage: MotionStorage | null | undefined,
  choice: MotionChoice,
): void {
  try {
    storage?.setItem(MOTION_STORAGE_KEY, choice);
  } catch {
    // Storage unavailable: the OS setting decides, without errors.
  }
}

/**
 * Whether Illustration Motion is on: an explicit choice wins in both
 * directions, so a stored Play beats an OS asking for reduced motion and a
 * stored Pause beats an OS without it. Without a stored choice the OS
 * `prefers-reduced-motion` setting decides.
 */
export function resolveMotionOn(stored: StoredMotionChoice, prefersReducedMotion: boolean): boolean {
  if (stored === 'on') return true;
  if (stored === 'off') return false;
  return !prefersReducedMotion;
}

/**
 * Which control the Illustration shows: Pause while Motion is on, Play while
 * it is off or the browser refused to animate, and none without Motion,
 * before hydration (the control is rendered only with JavaScript), or after
 * a failure took Motion away for this Showing.
 */
export function motionControlState({
  hasMotion,
  hydrated,
  failed,
  motionOn,
  refused,
}: {
  /** The Illustration carries Motion Layers and a Showing key. */
  hasMotion: boolean;
  /** The client has hydrated: the Still is on screen with JavaScript running. */
  hydrated: boolean;
  /** The Still failed to load, or a Layer file failed for this Showing. */
  failed: boolean;
  /** The Motion preference is on (an explicit Play or the OS setting). */
  motionOn: boolean;
  /** The browser refused to animate this Showing. */
  refused: boolean;
}): 'pause' | 'play' | null {
  if (!hasMotion || !hydrated || failed) return null;
  return motionOn && !refused ? 'pause' : 'play';
}
