// Switching the Interface Language (docs/spec/architecture.md, interface
// language): a Server Action that sets the language cookie and refreshes the
// current page. Choosing the current language does nothing.

'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { isInterfaceLanguage, type InterfaceLanguage } from '@/i18n/index';
import {
  getInterfaceLanguage,
  INTERFACE_LANGUAGE_COOKIE,
  languageCookieAttributes,
} from './language';

export async function setInterfaceLanguage(formData: FormData): Promise<void> {
  const next = formData.get('language');
  if (!isInterfaceLanguage(next)) return;
  const current: InterfaceLanguage = await getInterfaceLanguage();
  if (next === current) return;
  const jar = await cookies();
  jar.set(INTERFACE_LANGUAGE_COOKIE, next, languageCookieAttributes());
  revalidatePath('/', 'layout');
}
