import type { Metadata } from 'next';
import './globals.css';
import { getCatalogue } from '@/i18n/index';
import { getInterfaceLanguage } from './lib/language';
import { TopNavigation } from './top-navigation';

export const metadata: Metadata = {
  title: 'Simple RPG Engine',
  description: 'Single-player RPG adventures in the browser.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const language = await getInterfaceLanguage();
  const catalogue = getCatalogue(language);
  return (
    <html lang={language}>
      <body>
        <header className="topnav">
          <TopNavigation language={language} catalogue={catalogue} />
        </header>
        {children}
      </body>
    </html>
  );
}
