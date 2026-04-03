import { NervStatus } from './nerv-status';

export interface NervPanelProps {
  title?: string;
  subtitle?: string;
  status?: 'online' | 'warning' | 'critical' | 'offline';
  accent?: 'orange' | 'green' | 'red' | 'blue' | 'amber' | 'purple';
  scanlines?: boolean;
  corners?: boolean;
  className?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

const accentBorderMap: Record<string, string> = {
  orange: 'border-l-nerv-orange',
  green: 'border-l-nerv-green',
  red: 'border-l-nerv-red',
  blue: 'border-l-nerv-blue',
  amber: 'border-l-nerv-amber',
  purple: 'border-l-nerv-purple',
};

export function NervPanel({
  title,
  subtitle,
  status,
  accent = 'orange',
  scanlines = false,
  corners = true,
  className = '',
  headerRight,
  children,
}: NervPanelProps) {
  const accentClass = accentBorderMap[accent] ?? 'border-l-nerv-orange';

  return (
    <div
      className={[
        'relative bg-nerv-bg-panel border border-nerv-border border-l-2 flex flex-col',
        accentClass,
        corners ? 'nerv-corners' : '',
        scanlines ? 'nerv-scanlines' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {title && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-nerv-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {status && <NervStatus status={status} size="sm" />}
            <span className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-secondary truncate">
              {title}
            </span>
            {subtitle && (
              <span className="text-[10px] font-mono text-nerv-text-muted truncate hidden sm:inline">
                {subtitle}
              </span>
            )}
          </div>
          {headerRight && (
            <div className="flex items-center gap-2 ml-2 shrink-0">
              {headerRight}
            </div>
          )}
        </div>
      )}
      <div className="relative flex-1 min-h-0">{children}</div>
    </div>
  );
}
