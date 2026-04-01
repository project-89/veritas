import './globals.css';
import { NavBar } from '../components/nav-bar';

export const metadata = {
  title: 'Veritas',
  description: 'Narrative tracking and analysis across digital platforms',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" translate="no">
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className="bg-slate-950 text-slate-100">
        <div className="min-h-screen flex flex-col">
          <NavBar />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
