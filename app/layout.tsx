import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'survey-snap',
  description: 'Receipt-to-survey assistant for McDVoice',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#10100f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="app">
          <span className="logo" aria-hidden>
            🧾
          </span>
          <h1>
            <Link href="/" style={{ color: 'inherit' }}>
              survey-snap
            </Link>
          </h1>
          <span className="spacer" />
          <Link href="/capture" className="muted">
            + New
          </Link>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
