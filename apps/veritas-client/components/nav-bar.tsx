'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function NavBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.get('q');
  const isResults = pathname === '/results';

  return (
    <nav className="bg-slate-900 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Left: Logo + query context */}
          <div className="flex items-center gap-4">
            <Link href="/" className="text-lg font-bold text-white tracking-tight hover:text-indigo-300 transition-colors">
              Veritas
            </Link>
            {isResults && query && (
              <div className="hidden sm:flex items-center gap-2 text-sm text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-slate-300 max-w-xs truncate">{query}</span>
              </div>
            )}
          </div>

          {/* Right: Demos link */}
          <div className="flex items-center gap-4">
            <Link
              href="/demos/all"
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                pathname.startsWith('/demos')
                  ? 'bg-slate-800 text-indigo-300'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              Demos
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

export function NavBar() {
  return (
    <Suspense fallback={
      <nav className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-14">
            <span className="text-lg font-bold text-white tracking-tight">Veritas</span>
          </div>
        </div>
      </nav>
    }>
      <NavBarInner />
    </Suspense>
  );
}
