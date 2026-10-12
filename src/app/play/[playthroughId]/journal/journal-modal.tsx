// The journal modal (docs/spec/ui.md, journal): every "View journal" link
// that sits next to play opens the Journal over the game screen instead of
// navigating away, with an "Open in new tab" link to the full page.
//
// The trigger is a plain anchor to the Journal URL, so navigating directly,
// reloading, or following the link without JavaScript still shows the full
// Journal page. With JavaScript the click is intercepted and the modal opens
// over the current screen: the game underneath is never reloaded and keeps
// its state. Inside, the Journal behaves as on the full page (newest first,
// infinite scroll towards the first entry, the sticky position indicator),
// all scrolling within the modal body. The modal closes on its close button,
// the Escape key and a backdrop click; it traps focus while open, returns
// focus to the trigger on close, and locks the background scroll.
//
// Relative imports only: vitest has no `@/` alias, and tests drive this
// module directly with react-dom/server.

'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { journalHref, type RenderedJournalEntry } from '../../../lib/journal';
import { JournalEntries } from './journal-entries';

/**
 * Every Interface Text string the link and its modal show. The server renders
 * these through the catalogue and passes them as props, so no catalogue is
 * shipped to the browser (docs/spec/architecture.md, interface text).
 */
export type JournalModalText = {
  viewJournal: string;
  title: string;
  total: string;
  openInNewTab: string;
  close: string;
};

export function JournalModalLink({
  playthroughId,
  initialEntries,
  initialNextCursor,
  total,
  className,
  text,
}: {
  playthroughId: string;
  initialEntries: RenderedJournalEntry[];
  initialNextCursor: number | null;
  total: number;
  /** The trigger styling of the screen it sits on (for example the Ending screen's secondary button). */
  className?: string;
  /** Interface Text, rendered by the server through the catalogue. */
  text: JournalModalText;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLAnchorElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const href = journalHref(playthroughId);

  const close = useCallback(() => {
    setOpen(false);
    // The trigger stays mounted behind the modal, so focus returns directly.
    triggerRef.current?.focus();
  }, []);

  const openModal = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setOpen(true);
  }, []);

  // While open: focus the close button, trap Tab inside the dialog, close on
  // Escape, and lock the background scroll. Focus returns to the trigger via
  // `close`.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled'));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;
      const active = document.activeElement;
      // Focus starting outside the dialog (for example after a backdrop
      // mousedown) wraps back inside on either Tab direction, so focus can
      // never leave the modal while it is open.
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <>
      <a ref={triggerRef} href={href} className={className} onClick={openModal}>
        {text.viewJournal}
      </a>
      {open ? (
        <div
          className="journal-modal-backdrop"
          data-testid="journal-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="journal-modal"
            data-testid="journal-modal"
          >
            <div className="journal-modal-header">
              <h2 id={titleId}>{text.title}</h2>
              <p className="meta">
                {text.total}{' '}
                <a href={href} target="_blank" rel="noreferrer">
                  {text.openInNewTab}
                </a>
              </p>
              <button ref={closeRef} type="button" className="button secondary" onClick={close}>
                {text.close}
              </button>
            </div>
            <div className="journal-modal-body" data-testid="journal-modal-body">
              <JournalEntries
                playthroughId={playthroughId}
                initialEntries={initialEntries}
                initialNextCursor={initialNextCursor}
                total={total}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
