// The Outcome modal (Outcome narration after a Choice or Test): the Test,
// the Outcome narration and the state changes of the latest step shown in an
// accessible modal over the Playthrough's current Location, rather than
// replacing the Location view with the presentation.
//
// The acknowledgement is client-side only, like the intro modal's Continue:
// a plain link to the same game page carrying the current `step` as
// `?seen=`. When it equals the Playthrough's current `step` the server skips
// the modal and renders the position; any other value is ignored and the modal
// is shown again. Following it (or any dismissal: Escape, backdrop click, the
// close control) changes no game state, does not advance `step`, applies no
// Effects again, rerolls no Test and duplicates no Journal entries. Reloading
// without the parameter may show the modal again, harmlessly.
//
// While open, the Location actions behind it cannot be invoked: the page
// renders the background reading column `inert`, and map travel is disabled
// (`canTravel` false). The side panel stays visible, and its backdrop sits
// below the top navigation and the side panel (see `.outcome-modal-backdrop`
// in globals.css), so the Journal launcher and the language switcher stay
// usable: the Journal opens over the undismissed outcome, and a language
// switch shows the same outcome modal again in the mixed languages. After
// acknowledgement the next playable state appears through the existing engine
// transition sequence: the Location view, the following Scene, Combat panel
// or Ending screen.

'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function OutcomeModal({
  label,
  closeLabel,
  acknowledgeHref,
  continueLabel,
  entries,
}: {
  /** Accessible name of the dialog (the latest-events title). */
  label: string;
  /** Accessible name of the close control. */
  closeLabel: string;
  /** The game-screen URL acknowledging the presentation (`?seen=<step>`). */
  acknowledgeHref: string;
  /** Interface Text: the Continue button label. */
  continueLabel: string;
  /** Server-rendered narration HTML (HTML-escaped, emphasis only), in order. */
  entries: string[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const acknowledgeRef = useRef(acknowledgeHref);
  acknowledgeRef.current = acknowledgeHref;

  // Lock the background scroll while open; initial focus lands on Continue,
  // the primary acknowledgement control. With no entries there is no dialog,
  // so the effects stay idle.
  useEffect(() => {
    if (entries.length === 0) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const acknowledge = dialog?.querySelector<HTMLElement>('[data-modal-acknowledge]');
    (acknowledge ?? dialog)?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Escape acknowledges; Tab cycles inside the dialog.
  useEffect(() => {
    if (entries.length === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        router.push(acknowledgeRef.current);
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusables.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [router]);

  if (entries.length === 0) return null;

  return (
    <div
      className="panel-modal-backdrop outcome-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          router.push(acknowledgeRef.current);
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="panel-modal"
        tabIndex={-1}
      >
        <div className="panel-modal-head">
          <h2 className="panel-modal-title">{label}</h2>
          <Link
            href={acknowledgeHref}
            aria-label={closeLabel}
            className="panel-modal-close"
          >
            <span aria-hidden="true">×</span>
          </Link>
        </div>
        <div className="outcome-entries" aria-label={label}>
          {entries.map((html, index) => (
            <div key={index} dangerouslySetInnerHTML={{ __html: html }} />
          ))}
        </div>
        <p>
          <Link className="button" href={acknowledgeHref} data-modal-acknowledge>
            {continueLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
