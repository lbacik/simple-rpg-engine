// The app's own not-found page (docs/spec/ui.md, interface text), in the
// Interface Language instead of Next.js's built-in English one.

import type { Metadata } from 'next';
import { getCatalogue } from '@/i18n/index';
import { getInterfaceLanguage } from './lib/language';

export async function generateMetadata(): Promise<Metadata> {
  const catalogue = getCatalogue(await getInterfaceLanguage());
  return { title: catalogue.notFound.title, description: catalogue.notFound.body };
}

export default async function NotFound(): Promise<React.ReactNode> {
  const catalogue = getCatalogue(await getInterfaceLanguage());
  return (
    <main>
      <h1>{catalogue.notFound.title}</h1>
      <p>{catalogue.notFound.body}</p>
      <p>
        <a className="button secondary" href="/">
          {catalogue.notFound.home}
        </a>
      </p>
    </main>
  );
}
