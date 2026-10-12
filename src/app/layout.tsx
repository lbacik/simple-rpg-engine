import type { Metadata } from 'next';
import './globals.css';
import { getCatalogue } from '@/i18n/index';
import { InterfaceLanguageProvider } from './language-context';
import { getInterfaceLanguage } from './lib/language';
import { TopNavigation } from './top-navigation';

export async function generateMetadata(): Promise<Metadata> {
  const catalogue = getCatalogue(await getInterfaceLanguage());
  return { title: catalogue.app.title, description: catalogue.app.description };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const language = await getInterfaceLanguage();
  const catalogue = getCatalogue(language);
  return (
    <html lang={language}>
      <body>
        <header className="topnav">
          <TopNavigation language={language} catalogue={catalogue} />
        </header>
        <InterfaceLanguageProvider language={language}>{children}</InterfaceLanguageProvider>
      </body>
    </html>
  );
}
