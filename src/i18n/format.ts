// Number formatting in the Interface Language
// (docs/spec/architecture.md, interface text; docs/spec/ui.md, interface text).
// Framework-free: this module imports no Next.js, React, persistence,
// content or engine runtime code (types from the engine excepted).

import type { InterfaceLanguage } from './languages';

const formatters = new Map<InterfaceLanguage, Intl.NumberFormat>();

function formatterFor(language: InterfaceLanguage): Intl.NumberFormat {
  const cached = formatters.get(language);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(language);
  formatters.set(language, formatter);
  return formatter;
}

/** Format a number with `Intl` in the Interface Language. */
export function formatNumber(language: InterfaceLanguage, value: number): string {
  return formatterFor(language).format(value);
}
