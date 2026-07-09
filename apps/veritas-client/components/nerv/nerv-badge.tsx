export interface NervBadgeProps {
  label: string;
  variant: 'orange' | 'green' | 'red' | 'blue' | 'amber' | 'purple' | 'muted';
  size?: 'sm' | 'md';
  pulse?: boolean;
}

const variantStyles: Record<string, string> = {
  orange:
    'bg-nerv-orange/22 text-nerv-orange border-nerv-orange/45 shadow-[0_0_12px_rgba(255,133,61,0.12)]',
  green:
    'bg-nerv-green/20 text-nerv-green border-nerv-green/45 shadow-[0_0_12px_rgba(61,255,133,0.12)]',
  red: 'bg-nerv-red/20 text-nerv-red border-nerv-red/45 shadow-[0_0_12px_rgba(255,102,127,0.14)]',
  blue: 'bg-nerv-blue/20 text-nerv-blue border-nerv-blue/45 shadow-[0_0_12px_rgba(72,194,255,0.14)]',
  amber:
    'bg-nerv-amber/22 text-nerv-amber border-nerv-amber/45 shadow-[0_0_12px_rgba(255,191,74,0.14)]',
  purple:
    'bg-nerv-purple/22 text-nerv-purple border-nerv-purple/45 shadow-[0_0_12px_rgba(191,122,255,0.14)]',
  muted: 'bg-nerv-bg-elevated/90 text-nerv-text-secondary border-nerv-border-active/60',
};

const sizeStyles: Record<string, string> = {
  sm: 'text-[12px] px-1.5 py-0.5',
  md: 'text-[13px] px-2.5 py-1',
};

export function NervBadge({ label, variant, size = 'sm', pulse = false }: NervBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center font-mono uppercase tracking-[0.16em] border rounded-sm leading-none',
        variantStyles[variant] ?? variantStyles.muted,
        sizeStyles[size],
        pulse ? 'animate-nerv-pulse' : '',
      ].join(' ')}
    >
      {label}
    </span>
  );
}
