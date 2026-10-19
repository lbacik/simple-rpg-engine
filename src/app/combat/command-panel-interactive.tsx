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

  return (
    <div onClick={onClick}>
      <CommandPanel {...rest} selection={selection} />
    </div>
  );
}
