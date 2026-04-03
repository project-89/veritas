export interface NervBadgeProps {
  label: string;
  variant: 'orange' | 'green' | 'red' | 'blue' | 'amber' | 'purple' | 'muted';
  size?: 'sm' | 'md';
  pulse?: boolean;
}

const variantStyles: Record<string, string> = {
  orange: 'bg-nerv-orange/15 text-nerv-orange border-nerv-orange/30',
  green: 'bg-nerv-green/15 text-nerv-green border-nerv-green/30',
  red: 'bg-nerv-red/15 text-nerv-red border-nerv-red/30',
  blue: 'bg-nerv-blue/15 text-nerv-blue border-nerv-blue/30',
  amber: 'bg-nerv-amber/15 text-nerv-amber border-nerv-amber/30',
  purple: 'bg-nerv-purple/15 text-nerv-purple border-nerv-purple/30',
  muted: 'bg-nerv-bg-elevated text-nerv-text-muted border-nerv-border',
};

const sizeStyles: Record<string, string> = {
  sm: 'text-[9px] px-1.5 py-0.5',
  md: 'text-[10px] px-2 py-0.5',
};

export function NervBadge({ label, variant, size = 'sm', pulse = false }: NervBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center font-mono uppercase tracking-wider border rounded-sm leading-none',
        variantStyles[variant] ?? variantStyles.muted,
        sizeStyles[size],
        pulse ? 'animate-nerv-pulse' : '',
      ].join(' ')}
    >
      {label}
    </span>
  );
}
