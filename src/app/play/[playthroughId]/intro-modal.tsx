// The Scenario intro modal (intro display): when a Playthrough begins with a
// Scenario that has an intro, the starting Location renders beneath and the
// intro narration shows in this modal above it. Continue acknowledges the
// intro without changing game state (the same `?seen=<step>` acknowledgement
// as the outcome modal's Continue): the Outcome was already applied at start,
// so following it advances no `step`, repeats no Effects and appends no
// Journal entries. Reloading without the parameter shows the modal again,
// harmlessly; with it the position renders directly. There is no persisted
// "awaiting Continue" state.
//
// The trigger is the Continue link itself: without JavaScript it is a plain
// link navigation to the acknowledged URL and nothing in the background
// flashes that should stay hidden. With JavaScript the link navigates softly,
// Escape and backdrop click acknowledge the same way, focus is trapped while
// open and returned via the navigation, and the background does not scroll.
// The background renders no forms while the modal is open, so Location
// actions cannot be submitted through it either way.

'use client';

import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';
import { useRouter } from 'next/navigation';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function IntroModal({
  continueHref,
  continueLabel,
  title,
  introHtml,
  lang,
}: {
  /** The acknowledgement URL: the same game page carrying `?seen=<step>`. */
  continueHref: string;
  /** Interface Text for the Continue control. */
  continueLabel: string;
  /** Accessible name of the dialog (the Intro label). */
  title: string;
  /** Server-rendered intro narration HTML (formatting and name as presented). */
  introHtml: string;
  /** The language the intro was presented in (the entry's `lang`). */
  lang: string;
}) {
  const router = useRouter();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLAnchorElement>(null);
  const continueTarget = useRef(continueHref);
  continueTarget.current = continueHref;

  // Lock the background scroll while open and focus Continue on entry, so
  // keyboard users land on the acknowledgement without tabbing through the
  // inert background first.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    continueRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Escape acknowledges like Continue; Tab cycles inside the dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        router.push(continueTarget.current);
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

  return (
    <div
      className="panel-modal-backdrop"
      data-testid="intro-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          router.push(continueTarget.current);
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="panel-modal"
        data-testid="intro-modal"
        tabIndex={-1}
      >
        <h2 id={titleId} className="panel-modal-title">
          {title}
        </h2>
        <div
          className="narration"
          lang={lang}
          data-testid="intro-modal-text"
          dangerouslySetInnerHTML={{ __html: introHtml }}
        />
        <p>
          <Link
            ref={continueRef}
            className="button"
            href={continueHref}
            data-testid="intro-modal-continue"
          >
            {continueLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
