// PROTOTYPE (#196), throwaway. Client state for the animated Illustration
// prototype: the motion preference from the motion accessibility policy (#195),
// the simulation toggles of the lab panel, and the selected variant.

import { useSyncExternalStore } from 'react';

export type VariantKey = 'static' | 'A' | 'B' | 'C' | 'D';
export const VARIANTS: { key: VariantKey; label: string }[] = [
  { key: 'static', label: 'Today: static <img>' },
  { key: 'A', label: 'Whole file: looping video' },
  { key: 'B', label: 'Whole file: animated AVIF' },
  { key: 'C', label: 'Still + engine effect presets' },
  { key: 'D', label: 'Still + author layers/sprites' },
];

export type Lab = {
  simulateReducedMotion: boolean;
  failAnimation: boolean;
  refuseAutoplay: boolean;
};

export type MotionState = {
  variant: VariantKey;
  osReduced: boolean;
  stored: 'on' | 'off' | null;
  lab: Lab;
  motionOn: boolean;
};

const PREF_KEY = 'prototype-animated-illustration:motion';
const LAB_KEY = 'prototype-animated-illustration:lab';
const VARIANT_KEY = 'prototype-animated-illustration:variant';

const SERVER_STATE: MotionState = {
  variant: 'static',
  osReduced: false,
  stored: null,
  lab: { simulateReducedMotion: false, failAnimation: false, refuseAutoplay: false },
  motionOn: false,
};

const listeners = new Set<() => void>();
let state: MotionState | null = null;

function read<T>(storage: () => Storage, key: string): T | null {
  try {
    const raw = storage().getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: unknown) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the OS setting decides (policy #195).
  }
}

function compute(): MotionState {
  const osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stored = read<'on' | 'off'>(() => localStorage, PREF_KEY);
  const lab = { ...SERVER_STATE.lab, ...read<Lab>(() => sessionStorage, LAB_KEY) };
  // `?anim=` wins and is remembered for the tab, because form redirects drop it.
  const fromUrl = new URLSearchParams(window.location.search).get('anim') as VariantKey | null;
  if (fromUrl && VARIANTS.some((v) => v.key === fromUrl)) write(() => sessionStorage, VARIANT_KEY, fromUrl);
  const variant = read<VariantKey>(() => sessionStorage, VARIANT_KEY) ?? 'A';
  // An explicit player choice wins in both directions; otherwise the OS decides.
  const motionOn = stored !== null ? stored === 'on' : !(osReduced || lab.simulateReducedMotion);
  return { variant, osReduced, stored, lab, motionOn };
}

function emit() {
  state = compute();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onStorage = () => emit();
  if (listeners.size === 1) {
    mq.addEventListener('change', emit);
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      mq.removeEventListener('change', emit);
      window.removeEventListener('storage', onStorage);
    }
  };
}

function getSnapshot() {
  state ??= compute();
  return state;
}

export function useMotion(): MotionState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
}

export function setPreference(value: 'on' | 'off' | null) {
  write(() => localStorage, PREF_KEY, value);
  emit();
}

export function setLab(patch: Partial<Lab>) {
  write(() => sessionStorage, LAB_KEY, { ...getSnapshot().lab, ...patch });
  emit();
}

export function setVariant(variant: VariantKey) {
  write(() => sessionStorage, VARIANT_KEY, variant);
  const url = new URL(window.location.href);
  url.searchParams.set('anim', variant);
  window.history.replaceState(window.history.state, '', url);
  emit();
}
