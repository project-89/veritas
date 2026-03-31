'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SearchConfigPanel, DEFAULT_CONFIG } from '../components/search-config';
import type { SearchConfig } from '../components/search-config';

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [config, setConfig] = useState<SearchConfig>(DEFAULT_CONFIG);

  const handleSearch = useCallback(() => {
    const q = query.trim();
    if (!q) return;
    const params = new URLSearchParams({ q });
    if (config.platforms.length > 0 && config.platforms.length < 3) {
      params.set('platforms', config.platforms.join(','));
    }
    if (config.limit !== 100) {
      params.set('limit', String(config.limit));
    }
    if (config.timeRange !== '7d') {
      params.set('timeRange', config.timeRange);
    }
    router.push(`/results?${params.toString()}`);
  }, [query, config, router]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] px-4">
      {/* Hero / Search */}
      <div className="w-full max-w-2xl text-center mb-12">
        <h1 className="text-4xl sm:text-5xl font-bold text-white mb-3 tracking-tight">
          Veritas
        </h1>
        <p className="text-slate-400 text-lg mb-8">
          Search any topic. Analyze narratives across Reddit, Twitter/X, and YouTube.
        </p>

        {/* Search bar */}
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter a topic to analyze..."
            autoFocus
            className="flex-1 px-5 py-3.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-base placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
          <button
            onClick={handleSearch}
            disabled={!query.trim()}
            className="px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-semibold text-base transition-colors"
          >
            Analyze
          </button>
        </div>

        {/* Search config */}
        <SearchConfigPanel config={config} onChange={setConfig} />
      </div>

      {/* Recent scans placeholder */}
      <div className="w-full max-w-2xl">
        <div className="border border-slate-800 rounded-xl p-8 text-center">
          <div className="text-slate-600 text-sm">
            <svg className="w-8 h-8 mx-auto mb-2 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            No previous scans
          </div>
        </div>
      </div>
    </div>
  );
}
