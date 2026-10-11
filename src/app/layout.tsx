import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Simple RPG Engine',
  description: 'Single-player RPG adventures in the browser.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="topnav">
          <nav>
            <a href="/">Scenarios</a>
            <a href="/playthroughs">My Playthroughs</a>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
