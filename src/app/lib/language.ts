// Interface Language resolution (docs/spec/architecture.md, interface
// language). Server-only: importing this module from a Client Component
// fails the build.

import 'server-only';

import { cookies, headers } from 'next/headers';
import { resolveInterfaceLanguage, type InterfaceLanguage } from '@/i18n/index';

export const INTERFACE_LANGUAGE_COOKIE = 'interface-language';
/** 400 days in seconds. */
export const INTERFACE_LANGUAGE_MAX_AGE = 400 * 24 * 60 * 60;

export function languageCookieAttributes(): {
  httpOnly: boolean;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: INTERFACE_LANGUAGE_MAX_AGE,
  };
}

/**
 * Resolve the Interface Language for the current request: the language
 * cookie when its value is an Interface Language, else the `Accept-Language`
 * Lookup match, else `en`. The negotiated default is never written to a
 * cookie: the cookie is set only when the player switches.
 */
export async function getInterfaceLanguage(): Promise<InterfaceLanguage> {
  const jar = await cookies();
  const headerList = await headers();
  return resolveInterfaceLanguage(
    jar.get(INTERFACE_LANGUAGE_COOKIE)?.value,
    headerList.get('accept-language'),
  );
}
