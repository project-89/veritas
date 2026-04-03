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
  online: 'shadow-[0_0_6px_rgba(0,255,65,0.5)]',
  warning: 'shadow-[0_0_6px_rgba(245,158,11,0.5)]',
  critical: 'shadow-[0_0_8px_rgba(233,69,96,0.6)]',
  offline: '',
};

const sizeMap: Record<string, string> = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
};

const labelSizeMap: Record<string, string> = {
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm',
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
            'font-mono uppercase tracking-wider text-nerv-text-secondary',
            labelSizeMap[size],
          ].join(' ')}
        >
          {label}
        </span>
      )}
    </span>
  );
}
