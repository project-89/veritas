'use client';

import { useEffect, useRef, useState } from 'react';

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

// Constant scroll speed. The keyframe travels -50% of the (duplicated) strip,
// so a fixed duration makes speed scale with item count — a long feed would
// fly by unreadably. Instead, derive the duration from the measured width.
const PX_PER_SECOND = 55;
const MIN_DURATION_S = 30;

export function NervTicker({ items, onItemClick }: NervTickerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [durationS, setDurationS] = useState(60);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    // One full loop = half the strip (items are rendered twice).
    const onePassPx = el.scrollWidth / 2;
    setDurationS(Math.max(MIN_DURATION_S, Math.round(onePassPx / PX_PER_SECOND)));
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="w-full overflow-hidden bg-nerv-bg border-t border-nerv-border h-8 flex items-center">
      <div
        ref={trackRef}
        className="flex items-center animate-nerv-ticker whitespace-nowrap"
        style={{ animationDuration: `${durationS}s` }}
      >
        {([0, 1] as const).flatMap((pass) =>
          items.map((item) => (
            <button
              key={`${item.id}:${item.timestamp}:${pass}`}
              type="button"
              onClick={onItemClick ? () => onItemClick(item.id) : undefined}
              className="inline-flex items-center gap-2 px-5 text-[13px] font-mono shrink-0 hover:bg-nerv-bg-elevated/40 transition-colors h-8"
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
          )),
        )}
      </div>
    </div>
  );
}
