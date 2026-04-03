export interface NervProgressStage {
  label: string;
  status: 'done' | 'running' | 'queued' | 'error';
}

export interface NervProgressProps {
  stages: NervProgressStage[];
}

const stageStyles: Record<string, { bg: string; text: string; extra?: string }> = {
  done: { bg: 'bg-nerv-green/20', text: 'text-nerv-green' },
  running: { bg: 'bg-nerv-orange/20', text: 'text-nerv-orange', extra: 'animate-nerv-pulse' },
  queued: { bg: 'bg-nerv-bg-elevated', text: 'text-nerv-text-muted' },
  error: { bg: 'bg-nerv-red/20', text: 'text-nerv-red' },
};

export function NervProgress({ stages }: NervProgressProps) {
  return (
    <div className="flex items-center gap-0.5 w-full">
      {stages.map((stage, i) => {
        const style = stageStyles[stage.status] ?? stageStyles.queued;
        return (
          <div key={i} className="flex items-center gap-0.5 flex-1 min-w-0">
            <div
              className={[
                'flex-1 h-6 flex items-center justify-center px-1',
                style.bg,
                style.extra ?? '',
                i === 0 ? 'rounded-l-sm' : '',
                i === stages.length - 1 ? 'rounded-r-sm' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'text-[9px] font-mono uppercase tracking-wider truncate',
                  style.text,
                ].join(' ')}
              >
                {stage.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <span className="text-nerv-text-muted text-[8px] shrink-0">{'\u25B8'}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
