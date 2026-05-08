import type { SaturationReport } from '../../lib/api';
import { NervBadge } from './nerv-badge';
import { NervBar } from './nerv-bar';

export interface SaturationIndicatorProps {
  saturation: SaturationReport | null;
  onSuggestDeepScan?: () => void;
}

const LEVEL_CONFIG: Record<
  SaturationReport['saturationLevel'],
  { variant: 'red' | 'amber' | 'green' | 'blue'; color: string }
> = {
  low: { variant: 'red', color: '#FF3B3B' },
  moderate: { variant: 'amber', color: '#FFB020' },
  high: { variant: 'green', color: '#00FF41' },
  saturated: { variant: 'blue', color: '#60A5FA' },
};

export function SaturationIndicator({ saturation, onSuggestDeepScan }: SaturationIndicatorProps) {
  if (!saturation) return null;

  const config = LEVEL_CONFIG[saturation.saturationLevel];
  const showDeepScan =
    onSuggestDeepScan &&
    (saturation.saturationLevel === 'low' || saturation.saturationLevel === 'moderate');

  return (
    <div className="flex items-center gap-3 font-mono">
      {/* Saturation level badge */}
      <NervBadge
        label={`SAT:${saturation.saturationLevel.toUpperCase()}`}
        variant={config.variant}
        size="sm"
      />

      {/* Coverage bar */}
      <div className="w-20">
        <NervBar value={saturation.topicCoverage} color={config.color} height={4} showLabel />
      </div>

      {/* Metrics summary */}
      <span className="text-[9px] text-nerv-text-secondary tracking-wide">
        {saturation.narrativeCount} narratives {'\u00B7'} {saturation.postCount} posts {'\u00B7'}{' '}
        {Math.round(saturation.unclusteredRatio * 100)}% unclustered
      </span>

      {/* Recommendation (only for low/moderate) */}
      {(saturation.saturationLevel === 'low' || saturation.saturationLevel === 'moderate') && (
        <span className="text-[8px] text-nerv-text-muted italic max-w-[200px] truncate">
          {saturation.recommendation}
        </span>
      )}

      {/* Deep scan button */}
      {showDeepScan && (
        <button
          type="button"
          onClick={onSuggestDeepScan}
          className="text-[8px] font-mono uppercase tracking-wider px-1.5 py-0.5 border border-nerv-orange/40 text-nerv-orange rounded-sm hover:bg-nerv-orange/10 transition-colors"
        >
          Deep Scan
        </button>
      )}
    </div>
  );
}
