import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'survey-snap',
  description: 'Receipt-to-survey assistant for McDVoice',
  manifest: '/manifest.json',
  // House icon set (scripts/icons/build.py): favicon.ico + apple-touch-icon in
  // the head, 192/512/maskable in the manifest.
  icons: {
    icon: [{ url: '/favicon.ico', sizes: 'any' }],
    apple: [{ url: '/apple-touch-icon.png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f0e0c',
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
