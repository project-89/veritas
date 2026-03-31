'use client';

interface SentimentBarProps {
  positive: number;
  neutral: number;
  negative: number;
  total: number;
}

export function SentimentBar({ positive, neutral, negative, total }: SentimentBarProps) {
  if (total === 0) return null;

  const pPct = (positive / total) * 100;
  const nPct = (neutral / total) * 100;
  const negPct = (negative / total) * 100;

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>Positive {pPct.toFixed(0)}%</span>
        <span>Neutral {nPct.toFixed(0)}%</span>
        <span>Negative {negPct.toFixed(0)}%</span>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-800">
        {positive > 0 && (
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${pPct}%` }}
          />
        )}
        {neutral > 0 && (
          <div
            className="bg-slate-500 transition-all duration-500"
            style={{ width: `${nPct}%` }}
          />
        )}
        {negative > 0 && (
          <div
            className="bg-red-500 transition-all duration-500"
            style={{ width: `${negPct}%` }}
          />
        )}
      </div>
    </div>
  );
}
