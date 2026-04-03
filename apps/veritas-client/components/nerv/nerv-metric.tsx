import { NervSparkline } from './nerv-sparkline';

export interface NervMetricProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  severity?: 'normal' | 'warning' | 'critical';
  sparkline?: number[];
}

const severityColorMap: Record<string, string> = {
  normal: 'text-nerv-text',
  warning: 'text-nerv-amber',
  critical: 'text-nerv-red',
};

const trendIcons: Record<string, { symbol: string; color: string }> = {
  up: { symbol: '\u25B2', color: 'text-nerv-red' },
  down: { symbol: '\u25BC', color: 'text-nerv-green' },
  stable: { symbol: '\u25C6', color: 'text-nerv-text-muted' },
};

export function NervMetric({
  label,
  value,
  unit,
  trend,
  severity = 'normal',
  sparkline,
}: NervMetricProps) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2">
      <span className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={[
            'text-xl font-mono font-bold tabular-nums',
            severityColorMap[severity],
          ].join(' ')}
        >
          {value}
        </span>
        {unit && (
          <span className="text-[10px] font-mono text-nerv-text-muted uppercase">
            {unit}
          </span>
        )}
        {trend && (
          <span className={['text-[10px]', trendIcons[trend]!.color].join(' ')}>
            {trendIcons[trend]!.symbol}
          </span>
        )}
      </div>
      {sparkline && sparkline.length > 1 && (
        <div className="mt-1">
          <NervSparkline
            data={sparkline}
            width={80}
            height={16}
            color={
              severity === 'critical'
                ? '#e94560'
                : severity === 'warning'
                  ? '#f59e0b'
                  : '#00FF41'
            }
            showEndDot
          />
        </div>
      )}
    </div>
  );
}
