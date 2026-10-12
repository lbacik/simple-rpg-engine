'use client';

// PROTOTYPE — throwaway. Floating variant switcher for the Combat panel
// prototype. Hidden in production builds.

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export const VARIANT_COOKIE = 'combatProtoVariant';

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: { key: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );

  const go = useCallback(
    (delta: number) => {
      const next = variants[(index + delta + variants.length) % variants.length];
      if (!next) return;
      // The cookie keeps the variant across the Combat action redirect,
      // which drops the query string.
      document.cookie = `${VARIANT_COOKIE}=${next.key}; path=/; max-age=86400`;
      const params = new URLSearchParams(window.location.search);
      params.set('variant', next.key);
      params.delete('notice');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [index, pathname, router, variants],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') go(-1);
      if (event.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (process.env.NODE_ENV === 'production') return null;

  const active = variants[index];
  return (
    <div className="proto-switcher" role="toolbar" aria-label="Prototype variant">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant">
        ←
      </button>
      <span>
        <strong>{active?.key}</strong> {active ? `(${active.name})` : null}
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">
        →
      </button>
    </div>
  );
}
