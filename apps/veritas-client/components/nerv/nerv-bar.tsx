export interface NervBarProps {
  value: number; // 0-1
  color?: string;
  showLabel?: boolean;
  height?: number;
}

export function NervBar({
  value,
  color = 'rgb(var(--nerv-orange))',
  showLabel = false,
  height = 6,
}: NervBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const pct = Math.round(clamped * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-nerv-bg-elevated rounded-sm overflow-hidden" style={{ height }}>
        <div
          className="h-full rounded-sm transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            boxShadow: `0 0 4px color-mix(in srgb, ${color} 25%, transparent)`,
          }}
        />
      </div>
      {showLabel && (
        <span className="text-[10px] font-mono tabular-nums text-nerv-text-secondary w-8 text-right shrink-0">
          {pct}%
        </span>
      )}
    </div>
  );
}
