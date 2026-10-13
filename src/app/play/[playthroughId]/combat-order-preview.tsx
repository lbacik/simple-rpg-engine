// The order-strip preview (docs/spec/ui.md, order strip): pointing at or
// focusing an action button inserts the Character's action at its server-given
// place and renumbers the Intent bubbles. A client-side enhancement only: it
// reads the positions the server rendered (`data-preview-order`,
// `data-bubble-order`, `data-strip-hint`), sends nothing, and never changes
// authoritative state. Without JavaScript the strip still lists every Intent
// with its place, and every button carries the same text.

'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function CombatOrderPreview({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (root === null) return;

    let savedDiscs: { disc: HTMLElement; text: string }[] = [];
    let savedHint: { hint: HTMLElement; text: string } | null = null;

    const clear = (): void => {
      for (const { disc, text } of savedDiscs) {
        disc.textContent = text;
      }
      savedDiscs = [];
      if (savedHint !== null) {
        savedHint.hint.textContent = savedHint.text;
        savedHint = null;
      }
    };

    const apply = (position: number, label: string): void => {
      clear();
      for (const lane of root.querySelectorAll<HTMLElement>('[data-bubble-order]')) {
        const order = Number(lane.getAttribute('data-bubble-order'));
        const disc = lane.querySelector<HTMLElement>('[data-bubble-disc]');
        if (disc !== null && Number.isInteger(order) && order >= position) {
          savedDiscs.push({ disc, text: disc.textContent ?? '' });
          disc.textContent = String(order + 1);
        }
      }
      const hint = root.querySelector<HTMLElement>('[data-strip-hint]');
      if (hint !== null) {
        savedHint = { hint, text: hint.textContent ?? '' };
        hint.textContent = label;
      }
    };

    const fromEvent = (target: EventTarget | null): { position: number; label: string } | null => {
      if (!(target instanceof HTMLElement)) return null;
      const button = target.closest('[data-preview-order]');
      if (button === null || !root.contains(button)) return null;
      const position = Number(button.getAttribute('data-preview-order'));
      if (!Number.isInteger(position)) return null;
      return { position, label: button.getAttribute('data-preview-text') ?? '' };
    };

    const onMouseOver = (event: MouseEvent): void => {
      const found = fromEvent(event.target);
      if (found !== null) apply(found.position, found.label);
    };
    const onMouseOut = (event: MouseEvent): void => {
      if (fromEvent(event.target) !== null) clear();
    };
    const onFocusIn = (event: FocusEvent): void => {
      const found = fromEvent(event.target);
      if (found !== null) apply(found.position, found.label);
    };
    const onFocusOut = (event: FocusEvent): void => {
      if (fromEvent(event.target) !== null) clear();
    };

    root.addEventListener('mouseover', onMouseOver);
    root.addEventListener('mouseout', onMouseOut);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    return () => {
      root.removeEventListener('mouseover', onMouseOver);
      root.removeEventListener('mouseout', onMouseOut);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  return <div ref={ref}>{children}</div>;
}
