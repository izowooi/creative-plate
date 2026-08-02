import type { KeyboardEvent } from "react";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;

  const dialog = event.currentTarget;
  const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
    (element) => element.getClientRects().length > 0,
  );
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable.at(-1)!;
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
