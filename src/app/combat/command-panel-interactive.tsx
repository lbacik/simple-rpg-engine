// The interactive command panel (Combat MVP 1.0, P4): the same CommandPanel
// with the browser computing the forecast locally from the isomorphic core.
// Selection links are intercepted and resolved in memory through the same
// parseSelection the server uses for the no-JavaScript render, so both modes
// show the same forecast for the same query. Confirm and Surrender stay plain
// POSTs: the server remains the only authority at commit.
//
// Hydration parity: the server must pass its live searchParams as
// initialQuery, so the first client render matches the server markup exactly.

'use client';

import { useMemo, useState } from 'react';
import { CommandPanel, type CommandPanelProps } from './command-panel';
import { parseSelection } from './selection';

type InteractiveProps = Omit<CommandPanelProps, 'selection'> & {
  initialQuery: Record<string, string>;
};

/**
 * Arrow-key selection across one option list — intents, cards or stances
 * (handoff U7). Links are already keyboard-operable with Tab and Enter; the
 * arrows move focus between the options without leaving the list. Pure so it
 * is unit-tested.
 */
export function nextOptionIndex(current: number, total: number, key: string): number | null {
  if (total <= 0 || current < 0 || current >= total) return null;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return (current + 1) % total;
    case 'ArrowUp':
    case 'ArrowLeft':
      return (current - 1 + total) % total;
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return null;
  }
}

export function CommandPanelInteractive({ initialQuery, ...rest }: InteractiveProps) {
  const [query, setQuery] = useState<Record<string, string>>(initialQuery);
  const selection = useMemo(() => parseSelection(query, rest.state), [query, rest.state]);

  function onClick(event: React.MouseEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.('a[data-sel]');
    if (anchor === null || anchor === undefined || !(anchor instanceof HTMLAnchorElement)) return;
    const url = new URL(anchor.getAttribute('href') ?? '', window.location.href);
    if (url.pathname !== window.location.pathname) return;
    event.preventDefault();
    setQuery(Object.fromEntries(url.searchParams.entries()));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement | null;
    const link = target?.closest?.('a[data-sel]');
    if (link === null || link === undefined || !(link instanceof HTMLAnchorElement)) return;
    const list = link.closest('.cp-intents, .cp-cards, .cp-stances');
    if (list === null) return;
    const links = [...list.querySelectorAll<HTMLAnchorElement>('a[data-sel]')];
    const dest = nextOptionIndex(links.indexOf(link), links.length, event.key);
    if (dest === null) return;
    event.preventDefault();
    links[dest]?.focus();
  }

  return (
    <div onClick={onClick} onKeyDown={onKeyDown}>
      <CommandPanel {...rest} selection={selection} />
    </div>
  );
}
