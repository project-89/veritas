export interface NervStatusProps {
  status: 'online' | 'warning' | 'critical' | 'offline';
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

const statusColorMap: Record<string, string> = {
  online: 'bg-nerv-green',
  warning: 'bg-nerv-amber',
  critical: 'bg-nerv-red',
  offline: 'bg-nerv-text-muted',
};

const statusGlowMap: Record<string, string> = {
  online: 'shadow-[0_0_10px_rgba(61,255,133,0.55)]',
  warning: 'shadow-[0_0_10px_rgba(255,191,74,0.5)]',
  critical: 'shadow-[0_0_12px_rgba(255,102,127,0.65)]',
  offline: '',
};

const sizeMap: Record<string, string> = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
};

const labelSizeMap: Record<string, string> = {
  sm: 'text-[11px]',
  md: 'text-[12px]',
  lg: 'text-[13px]',
};

export function NervStatus({ status, label, size = 'md' }: NervStatusProps) {
  const isPulsing = status === 'online' || status === 'critical';
  const animation = status === 'critical' ? 'animate-nerv-pulse-fast' : 'animate-nerv-pulse';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={[
          'rounded-full',
          sizeMap[size],
          statusColorMap[status],
          statusGlowMap[status],
          isPulsing ? animation : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
      {label && (
        <span
          className={[
            'font-mono uppercase tracking-[0.16em] text-nerv-text-secondary',
            labelSizeMap[size],
          ].join(' ')}
        >
          {label}
        </span>
      )}
    </span>
  );
}
