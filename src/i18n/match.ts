// `Accept-Language` matching (docs/spec/architecture.md, interface
// language): the RFC 4647 Lookup match against the Interface Languages by
// primary language subtag. `q` is honoured, `q=0` and `*` are skipped,
// malformed tags are skipped, and anything without a match resolves to `en`.

import {
  INTERFACE_LANGUAGES,
  primaryLanguageSubtag,
  type InterfaceLanguage,
} from './languages';

const RANGE_PATTERN = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;

interface WeightedRange {
  primary: string;
  quality: number;
  order: number;
}

function parseQuality(value: string | undefined): number {
  if (value === undefined) return 1;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return 1;
  return parsed;
}

/**
 * Match an `Accept-Language` header value against the Interface Languages.
 * A missing, empty or unmatchable header resolves to `en`.
 */
export function matchInterfaceLanguage(header: string | null | undefined): InterfaceLanguage {
  if (!header) return 'en';
  const ranges: WeightedRange[] = [];
  let order = 0;
  for (const part of header.split(',')) {
    const [rangePart, ...params] = part.split(';');
    const range = rangePart.trim();
    if (range === '' || range === '*') continue;
    if (!RANGE_PATTERN.test(range)) continue;
    let quality = 1;
    for (const param of params) {
      const [name, value] = param.split('=');
      if (name.trim().toLowerCase() === 'q') {
        quality = parseQuality(value);
        break;
      }
    }
    if (quality === 0) continue;
    ranges.push({ primary: primaryLanguageSubtag(range), quality, order });
    order += 1;
  }
  ranges.sort((a, b) => b.quality - a.quality || a.order - b.order);
  for (const range of ranges) {
    const match = (INTERFACE_LANGUAGES as readonly string[]).find(
      (language) => primaryLanguageSubtag(language) === range.primary,
    ) as InterfaceLanguage | undefined;
    if (match) return match;
  }
  return 'en';
}

/**
 * Resolve the Interface Language for a request from the raw cookie value and
 * the `Accept-Language` header value. A cookie value that is not an Interface
 * Language is ignored, since cookies are client-controlled.
 */
export function resolveInterfaceLanguage(
  cookieValue: string | undefined,
  acceptLanguage: string | null | undefined,
): InterfaceLanguage {
  if (
    cookieValue !== undefined &&
    (INTERFACE_LANGUAGES as readonly string[]).includes(cookieValue)
  ) {
    return cookieValue as InterfaceLanguage;
  }
  return matchInterfaceLanguage(acceptLanguage);
}
