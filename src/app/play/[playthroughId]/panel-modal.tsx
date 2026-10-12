// The side-panel modal behavior (docs/spec/ui.md, Character and inventory
// panel): the Character sheet, the inventory and (on phones) the map open in a
// modal over the game screen. The open modal is part of the URL (`?panel=`),
// so the server renders it open from the URL and the launchers are plain links
// without JavaScript. With JavaScript this wrapper adds the modal behavior:
// Escape and backdrop click navigate back to the panel-closed URL, focus is
// trapped while open and returned to the launcher on close, and the background
// does not scroll.

'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function PanelModal({
  label,
  closeHref,
  launcherId,
  children,
}: {
  /** Accessible name of the dialog (the panel title). */
  label: string;
  /** The game-screen URL with no panel open: closing navigates here. */
  closeHref: string;
  /** Id of the launcher that opened the modal: focus returns here on close. */
  launcherId: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(closeHref);
  closeRef.current = closeHref;

  // Lock the background scroll while open; return focus to the launcher that
  // opened the modal when it closes.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const close = dialog?.querySelector<HTMLElement>('[data-modal-close]');
    (close ?? dialog)?.focus();
    return () => {
      document.body.style.overflow = previous;
      const launcher = document.getElementById(launcherId);
      if (launcher) {
        // The game screen re-renders on close navigation; wait a frame so the
        // launcher in the new tree receives focus.
        requestAnimationFrame(() => {
          document.getElementById(launcherId)?.focus();
        });
      }
    };
  }, [launcherId]);

  // Escape closes; Tab cycles inside the dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        router.push(closeRef.current);
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
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          router.push(closeRef.current);
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
        {children}
      </div>
    </div>
  );
}
