// The Arena page (Combat MVP 1.0, S4): a stub. The tactical Arena was
// removed with the old Combat rules; the Arena returns on the shared Combat
// core with the adapter tickets (P6). Until then the route renders its title
// and description only, so the navigation entry keeps resolving.

import type { Metadata } from 'next';
import { getCatalogue } from '@/i18n/index';
import { getInterfaceLanguage } from '@/app/lib/language';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const catalogue = getCatalogue(await getInterfaceLanguage());
  return {
    title: catalogue.arena.title,
    description: catalogue.arena.description,
  };
}

export default async function ArenaPage() {
  const catalogue = getCatalogue(await getInterfaceLanguage());
  return (
    <main>
      <h1>{catalogue.arena.title}</h1>
      <p>{catalogue.arena.description}</p>
    </main>
  );
}
