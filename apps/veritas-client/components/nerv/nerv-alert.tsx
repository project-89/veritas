export interface NervAlertProps {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description?: string;
  timestamp?: string;
  onClick?: () => void;
}

const severityConfig: Record<
  string,
  { border: string; icon: string; iconColor: string; bg: string }
> = {
  info: {
    border: 'border-l-nerv-blue',
    icon: '\u25C9',
    iconColor: 'text-nerv-blue',
    bg: 'bg-nerv-blue/5',
  },
  warning: {
    border: 'border-l-nerv-amber',
    icon: '\u25B3',
    iconColor: 'text-nerv-amber',
    bg: 'bg-nerv-amber/5',
  },
  critical: {
    border: 'border-l-nerv-red',
    icon: '\u25C8',
    iconColor: 'text-nerv-red',
    bg: 'bg-nerv-red/5',
  },
};

export function NervAlert({
  type,
  severity,
  title,
  description,
  timestamp,
  onClick,
}: NervAlertProps) {
  const config = severityConfig[severity] ?? severityConfig.info;
  const classes = [
    'flex items-start gap-2 px-3 py-2 border-l-2 border border-nerv-border',
    config.border,
    config.bg,
    onClick ? 'cursor-pointer hover:bg-nerv-bg-elevated/40 transition-colors' : '',
  ].join(' ');

  const content = (
    <>
      <span className={['text-sm mt-0.5 shrink-0', config.iconColor].join(' ')}>{config.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-wider text-nerv-text-muted">
            {type}
          </span>
          {timestamp && (
            <span className="text-[10px] font-mono text-nerv-text-muted ml-auto shrink-0">
              {timestamp}
            </span>
          )}
        </div>
        <p className="text-xs font-mono text-nerv-text leading-snug mt-0.5 truncate">{title}</p>
        {description && (
          <p className="text-[10px] font-mono text-nerv-text-secondary leading-snug mt-0.5 line-clamp-2">
            {description}
          </p>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}
