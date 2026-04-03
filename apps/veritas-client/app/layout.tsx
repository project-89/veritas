import './globals.css';
import { JetBrains_Mono, Inter } from 'next/font/google';
import { NervNav } from '../components/nerv/nerv-nav';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
  weight: ['400', '500', '700'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata = {
  title: 'VERITAS',
  description: 'Narrative tracking and analysis across digital platforms',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${jetbrainsMono.variable} ${inter.variable}`}
      translate="no"
    >
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className="bg-nerv-bg-deep text-nerv-text font-display">
        {/* Global scan-line overlay — very subtle */}
        <div className="fixed inset-0 nerv-scanlines pointer-events-none z-[100]" />

        <div className="relative min-h-screen flex flex-col">
          <NervNav />
          <main className="flex-1 relative">{children}</main>
        </div>
      </body>
    </html>
  );
}
