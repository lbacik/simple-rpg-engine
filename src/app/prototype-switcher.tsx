// PROTOTYPE, throwaway. Floating bottom bar that cycles UI prototype variants
// (← / → buttons and arrow keys). Never rendered in production builds.

'use client';

import { useEffect } from 'react';

export function PrototypeSwitcher<K extends string>({
  variants,
  current,
  onChange,
}: {
  variants: { key: K; label: string }[];
  current: K;
  onChange: (key: K) => void;
}) {
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );
  const step = (delta: number) =>
    onChange(variants[(index + delta + variants.length) % variants.length].key);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable]')) return;
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (process.env.NODE_ENV === 'production') return null;
  const variant = variants[index];
  return (
    <div
      role="toolbar"
      aria-label="Prototype variants"
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 999,
        background: '#111',
        color: '#fff',
        font: '600 13px/1.2 system-ui, sans-serif',
        boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      }}
    >
      <button type="button" onClick={() => step(-1)} style={barButton} aria-label="Previous variant">
        ←
      </button>
      <span style={{ minWidth: 260, textAlign: 'center' }}>
        {variant.key} ({variant.label})
      </span>
      <button type="button" onClick={() => step(1)} style={barButton} aria-label="Next variant">
        →
      </button>
    </div>
  );
}

const barButton: React.CSSProperties = {
  background: '#333',
  color: '#fff',
  border: 0,
  borderRadius: 999,
  width: 32,
  height: 32,
  cursor: 'pointer',
  fontSize: 16,
};
