// The Interface Languages (docs/spec/architecture.md, interface language).
// Framework-free: this module imports no Next.js, React, persistence,
// content or engine runtime code (types from the engine excepted).

export const INTERFACE_LANGUAGES = ['en', 'pl'] as const;

export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number];

export function isInterfaceLanguage(value: unknown): value is InterfaceLanguage {
  return (
    typeof value === 'string' &&
    (INTERFACE_LANGUAGES as readonly string[]).includes(value)
  );
}

/** The primary language subtag of a BCP 47 tag, lower-cased (`pl-PL` → `pl`). */
export function primaryLanguageSubtag(tag: string): string {
  return tag.split('-')[0].toLowerCase();
}
