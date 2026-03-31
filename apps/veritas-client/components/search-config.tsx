'use client';

import { useState } from 'react';

export interface SearchConfig {
  timeRange: string;
  platforms: string[];
  limit: number;
}

const TIME_RANGES = [
  { label: 'Last 24h', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
];

const PLATFORMS = [
  { label: 'Reddit', value: 'reddit' },
  { label: 'Twitter/X', value: 'twitter' },
  { label: 'YouTube', value: 'youtube' },
];

const LIMITS = [50, 100, 200];

interface SearchConfigPanelProps {
  config: SearchConfig;
  onChange: (config: SearchConfig) => void;
}

export function SearchConfigPanel({ config, onChange }: SearchConfigPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const togglePlatform = (platform: string) => {
    const next = config.platforms.includes(platform)
      ? config.platforms.filter((p) => p !== platform)
      : [...config.platforms, platform];
    onChange({ ...config, platforms: next });
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-sm text-indigo-300 hover:text-indigo-100 transition-colors flex items-center gap-1"
      >
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Search Options
      </button>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Time Range */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Time Range</label>
            <div className="flex flex-wrap gap-1.5">
              {TIME_RANGES.map((tr) => (
                <button
                  key={tr.value}
                  type="button"
                  onClick={() => onChange({ ...config, timeRange: tr.value })}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    config.timeRange === tr.value
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </div>

          {/* Platforms */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Platforms</label>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => togglePlatform(p.value)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    config.platforms.includes(p.value)
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Limit */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Result Limit</label>
            <div className="flex flex-wrap gap-1.5">
              {LIMITS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => onChange({ ...config, limit: l })}
                  className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                    config.limit === l
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const DEFAULT_CONFIG: SearchConfig = {
  timeRange: '7d',
  platforms: ['reddit', 'twitter', 'youtube'],
  limit: 100,
};
