import './globals.css';
import { NavBar } from '../components/nav-bar';

export const metadata = {
  title: 'Veritas',
  description: 'Narrative tracking and analysis across digital platforms',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-gray-100">
          <header className="bg-white shadow-md">
            <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
              <h1 className="text-3xl font-bold text-gray-900">Veritas</h1>
              <p className="mt-2 text-gray-600">
                Narrative tracking and analysis across digital platforms
              </p>
            </div>
          </header>
          <NavBar />
          <main className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
