'use client';

export interface NervTickerItem {
  id: string;
  severity: string;
  text: string;
  timestamp: string;
}

export interface NervTickerProps {
  items: NervTickerItem[];
  onItemClick?: (id: string) => void;
}

const severityDotColor: Record<string, string> = {
  info: 'bg-nerv-blue',
  warning: 'bg-nerv-amber',
  critical: 'bg-nerv-red animate-nerv-pulse-fast',
};

export function NervTicker({ items, onItemClick }: NervTickerProps) {
  if (items.length === 0) return null;

  // Duplicate items for seamless loop
  const doubled = [...items, ...items];

  return (
    <div className="w-full overflow-hidden bg-nerv-bg border-t border-nerv-border h-8 flex items-center">
      <div className="flex items-center animate-nerv-ticker whitespace-nowrap">
        {doubled.map((item, i) => (
          <button
            key={`${item.id}-${i}`}
            onClick={onItemClick ? () => onItemClick(item.id) : undefined}
            className="inline-flex items-center gap-2 px-5 text-[11px] font-mono shrink-0 hover:bg-nerv-bg-elevated/40 transition-colors h-8"
          >
            <span
              className={[
                'w-1.5 h-1.5 rounded-full shrink-0',
                severityDotColor[item.severity] ?? 'bg-nerv-text-muted',
              ].join(' ')}
            />
            <span className="text-nerv-text-secondary/60">{item.timestamp}</span>
            <span className="text-nerv-text/80">{item.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
