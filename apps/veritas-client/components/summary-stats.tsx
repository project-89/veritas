'use client';

import { SentimentBar } from './sentiment-bar';

interface Summary {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
  byPlatform: Record<string, number>;
}

interface SummaryStatsProps {
  summary: Summary;
}

const PLATFORM_COLORS: Record<string, string> = {
  reddit: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  twitter: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  youtube: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export function SummaryStats({ summary }: SummaryStatsProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      {/* Top row: stat cards */}
      <div className="flex flex-wrap items-center gap-3">
        <StatChip label="Total Posts" value={summary.total} className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30" />
        <StatChip
          label="Positive"
          value={summary.positive}
          className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
        />
        <StatChip label="Neutral" value={summary.neutral} className="bg-slate-600/30 text-slate-300 border-slate-600/40" />
        <StatChip label="Negative" value={summary.negative} className="bg-red-500/20 text-red-300 border-red-500/30" />

        <div className="w-px h-6 bg-slate-700 mx-1 hidden sm:block" />

        {Object.entries(summary.byPlatform).map(([platform, count]) => (
          <StatChip
            key={platform}
            label={platform.charAt(0).toUpperCase() + platform.slice(1)}
            value={count}
            className={PLATFORM_COLORS[platform] ?? 'bg-purple-500/20 text-purple-300 border-purple-500/30'}
          />
        ))}
      </div>

      {/* Sentiment bar */}
      <SentimentBar
        positive={summary.positive}
        neutral={summary.neutral}
        negative={summary.negative}
        total={summary.total}
      />
    </div>
  );
}

function StatChip({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${className}`}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="opacity-70 text-xs">{label}</span>
    </div>
  );
}
