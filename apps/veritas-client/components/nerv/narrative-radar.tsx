'use client';

import { useMemo } from 'react';
import type { AnalyzedNarrative, DeviationResponse } from '../../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NarrativeRadarProps {
  narratives: AnalyzedNarrative[];
  selectedIds: string[];
  deviations: DeviationResponse | null;
  onCompare?: (narrativeIds: string[]) => void;
}

type AxisKey = 'velocity' | 'reach' | 'sentiment' | 'deviation' | 'platformDiv' | 'authorDiv';

interface AxisDefinition {
  key: AxisKey;
  chartLabel: [string, string];
  detailLabel: string;
  description: string;
  whatHighMeans: string;
}

interface NarrativeMetric {
  key: AxisKey;
  detailLabel: string;
  description: string;
  whatHighMeans: string;
  value: number;
  scoreLabel: string;
  rawLabel: string;
  emphasisLabel: string;
}

interface RadarEntry {
  id: string;
  summary: string;
  values: number[];
  color: string;
  metrics: NarrativeMetric[];
}

const AXES = [
  {
    key: 'velocity',
    chartLabel: ['POSTING', 'PACE'],
    detailLabel: 'Posting Pace',
    description:
      'How quickly this narrative is generating new posts compared with the other narratives in view.',
    whatHighMeans:
      'Higher values mean this narrative is accelerating faster than the rest of the current result set.',
  },
  {
    key: 'reach',
    chartLabel: ['CONVERSATION', 'SHARE'],
    detailLabel: 'Conversation Share',
    description: 'How much of the captured conversation volume this narrative occupies.',
    whatHighMeans:
      'Higher values mean this narrative accounts for a larger share of the captured posts.',
  },
  {
    key: 'sentiment',
    chartLabel: ['EMOTIONAL', 'INTENSITY'],
    detailLabel: 'Emotional Intensity',
    description:
      'How emotionally charged the narrative is, regardless of whether the tone is positive or negative.',
    whatHighMeans:
      'Higher values mean the language is more emotionally loaded, whether positive or negative.',
  },
  {
    key: 'deviation',
    chartLabel: ['OUTLIER', 'SIGNAL'],
    detailLabel: 'Outlier Signal',
    description:
      'How far this narrative sits from the rest of the narrative field in the deviation analysis.',
    whatHighMeans:
      'Higher values mean this narrative is behaving less like the rest of the narratives in view.',
  },
  {
    key: 'platformDiv',
    chartLabel: ['PLATFORM', 'SPREAD'],
    detailLabel: 'Platform Spread',
    description: 'How broadly this narrative is spread across distinct platforms.',
    whatHighMeans: 'Higher values mean the narrative is present across more different platforms.',
  },
  {
    key: 'authorDiv',
    chartLabel: ['AUTHOR', 'BREADTH'],
    detailLabel: 'Author Breadth',
    description:
      'How distributed participation is across unique authors instead of being concentrated in a few accounts.',
    whatHighMeans:
      'Higher values mean more unique accounts are participating instead of a small cluster dominating.',
  },
] as const satisfies readonly AxisDefinition[];

const OVERLAY_COLORS = ['#FF6B2B', '#0ea5e9', '#00FF41'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMetrics(
  narrative: AnalyzedNarrative,
  maxVelocity: number,
  maxPosts: number,
  maxPlatforms: number,
  deviationMap: Map<string, number>,
): NarrativeMetric[] {
  const velocity = maxVelocity > 0 ? Math.min(narrative.velocity.postsPerHour / maxVelocity, 1) : 0;
  const reach = maxPosts > 0 ? Math.min(narrative.postIndices.length / maxPosts, 1) : 0;
  const sentimentMag = Math.min(Math.abs(narrative.avgSentiment), 1);
  // Distinguish "deviation is zero" from "deviation was never computed".
  const deviationComputed = deviationMap.has(narrative.id);
  const deviation = deviationMap.get(narrative.id) ?? 0;
  const platformCount = Object.keys(narrative.platforms).length;
  const platformDiv = maxPlatforms > 0 ? platformCount / maxPlatforms : 0;
  const uniqueAuthors = narrative.authors.length;
  const totalPosts = narrative.postIndices.length || 1;
  // Author Breadth via Simpson diversity (1 - HHI over per-author post shares):
  // the probability two random posts come from different authors. Unlike
  // uniqueAuthors/totalPosts, this drops sharply when one account dominates,
  // instead of saturating near 1 whenever most authors post once.
  const authorCounts = narrative.authors.map((a) => a.postCount);
  const sumAuthorPosts = authorCounts.reduce((s, c) => s + c, 0);
  let authorDiv: number;
  if (uniqueAuthors === 0) {
    authorDiv = 0;
  } else if (sumAuthorPosts <= 0) {
    // No per-author counts available — fall back to the crude ratio.
    authorDiv = Math.min(uniqueAuthors / totalPosts, 1);
  } else {
    const hhi = authorCounts.reduce((s, c) => {
      const share = c / sumAuthorPosts;
      return s + share * share;
    }, 0);
    authorDiv = 1 - hhi;
  }

  return [
    {
      key: 'velocity',
      detailLabel: 'Posting Pace',
      description: AXES[0].description,
      whatHighMeans: AXES[0].whatHighMeans,
      value: velocity,
      scoreLabel: `${Math.round(velocity * 100)} / 100`,
      rawLabel: `${narrative.velocity.postsPerHour.toFixed(1)} posts/hr (${narrative.velocity.trend})`,
      emphasisLabel: narrative.velocity.trend.toUpperCase(),
    },
    {
      key: 'reach',
      detailLabel: 'Conversation Share',
      description: AXES[1].description,
      whatHighMeans: AXES[1].whatHighMeans,
      value: reach,
      scoreLabel: `${Math.round(reach * 100)} / 100`,
      rawLabel: `${narrative.postIndices.length} posts captured`,
      emphasisLabel: `${Math.round(reach * 100)}% of max observed volume`,
    },
    {
      key: 'sentiment',
      detailLabel: 'Emotional Intensity',
      description: AXES[2].description,
      whatHighMeans: AXES[2].whatHighMeans,
      value: sentimentMag,
      scoreLabel: `${Math.round(sentimentMag * 100)} / 100`,
      rawLabel: `${narrative.avgSentiment.toFixed(2)} average sentiment`,
      emphasisLabel: narrative.avgSentiment >= 0 ? 'POSITIVE LEAN' : 'NEGATIVE LEAN',
    },
    {
      key: 'deviation',
      detailLabel: 'Outlier Signal',
      description: AXES[3].description,
      whatHighMeans: AXES[3].whatHighMeans,
      value: deviation,
      scoreLabel: deviationComputed ? `${Math.round(deviation * 100)} / 100` : '— / 100',
      rawLabel: !deviationComputed
        ? 'Not computed — run deviation analysis'
        : deviation > 0
          ? `${(deviation * 100).toFixed(0)}% of max observed deviation`
          : 'No significant deviation detected',
      emphasisLabel: !deviationComputed
        ? 'NOT COMPUTED'
        : deviation > 0.66
          ? 'HIGHLY DISTINCT'
          : deviation > 0.33
            ? 'MODERATELY DISTINCT'
            : 'NEAR BASELINE',
    },
    {
      key: 'platformDiv',
      detailLabel: 'Platform Spread',
      description: AXES[4].description,
      whatHighMeans: AXES[4].whatHighMeans,
      value: platformDiv,
      scoreLabel: `${Math.round(platformDiv * 100)} / 100`,
      rawLabel: `${platformCount} active platform${platformCount === 1 ? '' : 's'}`,
      emphasisLabel: platformCount === 1 ? 'SINGLE-PLATFORM' : 'CROSS-PLATFORM',
    },
    {
      key: 'authorDiv',
      detailLabel: 'Author Breadth',
      description: AXES[5].description,
      whatHighMeans: AXES[5].whatHighMeans,
      value: authorDiv,
      scoreLabel: `${Math.round(authorDiv * 100)} / 100`,
      rawLabel: `${uniqueAuthors} unique authors across ${totalPosts} posts`,
      emphasisLabel: `${Math.round(authorDiv * 100)}% author dispersion`,
    },
  ];
}

function hexagonPoint(
  cx: number,
  cy: number,
  radius: number,
  index: number,
  total: number,
): [number, number] {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function polygonPath(cx: number, cy: number, radius: number, values: number[]): string {
  const n = values.length;
  return `${values
    .map((v, i) => {
      const [x, y] = hexagonPoint(cx, cy, radius * v, i, n);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ')}Z`;
}

function hexGridPath(cx: number, cy: number, radius: number, levels: number): string {
  const paths: string[] = [];
  for (let l = 1; l <= levels; l++) {
    const r = (radius * l) / levels;
    const pts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const [x, y] = hexagonPoint(cx, cy, r, i, 6);
      pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    paths.push(`${pts.join(' ')}Z`);
  }
  return paths.join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NarrativeRadar({
  narratives,
  selectedIds,
  deviations,
  onCompare,
}: NarrativeRadarProps) {
  const radarData = useMemo<RadarEntry[] | null>(() => {
    if (narratives.length === 0) return null;

    // Compute normalization factors
    const maxVelocity = Math.max(...narratives.map((n) => n.velocity.postsPerHour), 0.01);
    const maxPosts = Math.max(...narratives.map((n) => n.postIndices.length), 1);
    const allPlatforms = new Set<string>();
    for (const n of narratives) {
      for (const p of Object.keys(n.platforms)) allPlatforms.add(p);
    }
    const maxPlatforms = allPlatforms.size || 1;

    // Deviation map
    const devMap = new Map<string, number>();
    if (deviations?.deviations) {
      const maxDev = Math.max(...deviations.deviations.map((d) => d.deviationMagnitude), 0.01);
      for (const d of deviations.deviations) {
        devMap.set(d.narrativeId, d.deviationMagnitude / maxDev);
      }
    }

    // Select which narratives to show (up to 3)
    let toShow: AnalyzedNarrative[];
    if (selectedIds.length > 0) {
      toShow = selectedIds
        .map((id) => narratives.find((n) => n.id === id))
        .filter(Boolean) as AnalyzedNarrative[];
    } else {
      toShow = narratives.slice(0, 1);
    }
    toShow = toShow.slice(0, 3);

    return toShow.map((n, i) => {
      const metrics = buildMetrics(n, maxVelocity, maxPosts, maxPlatforms, devMap);
      return {
        id: n.id,
        summary: n.summary,
        values: metrics.map((metric) => metric.value),
        metrics,
        color: OVERLAY_COLORS[i % OVERLAY_COLORS.length] ?? OVERLAY_COLORS[0] ?? '#0ea5e9',
      };
    });
  }, [narratives, selectedIds, deviations]);

  if (!radarData || radarData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-nerv-text-muted text-3xl mb-3">{'\u25C9'}</div>
          <div className="text-[12px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1">
            NARRATIVE RADAR
          </div>
          <div className="text-[12px] font-mono text-nerv-text-secondary max-w-[280px] leading-relaxed">
            Select narratives from the left panel to display multi-dimensional radar analysis.
            Shift-click to overlay up to 3 narratives.
          </div>
        </div>
      </div>
    );
  }

  const size = 500;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 104;
  const numAxes = AXES.length;

  return (
    <div className="h-full flex flex-col px-5 py-4">
      <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[minmax(460px,560px)_minmax(0,1fr)]">
        <div className="flex flex-col items-center justify-center rounded border border-nerv-border bg-nerv-bg-alt/20 p-3">
          <div className="mb-3 flex w-full max-w-[520px] items-baseline justify-between gap-3">
            <div className="text-[13px] font-mono uppercase tracking-[0.22em] text-nerv-text-muted">
              Narrative Radar
            </div>
            <div className="text-[11px] font-mono text-nerv-text-muted/70">
              center = weakest · edge = strongest, relative to loaded narratives
            </div>
          </div>

          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="block max-w-full"
            role="img"
            aria-label="Narrative radar comparison chart"
          >
            <title>Narrative radar comparison chart</title>
            <rect width={size} height={size} fill="#0a0a0f" />

            <path
              d={hexGridPath(cx, cy, radius, 5)}
              fill="none"
              stroke="#1a1a2e"
              strokeWidth={0.75}
            />

            {AXES.map((axis, i) => {
              const [x, y] = hexagonPoint(cx, cy, radius, i, numAxes);
              return (
                <line
                  key={axis.key}
                  x1={cx}
                  y1={cy}
                  x2={x}
                  y2={y}
                  stroke="#1a1a2e"
                  strokeWidth={0.75}
                />
              );
            })}

            {AXES.map((axis, i) => {
              const [x, y] = hexagonPoint(cx, cy, radius + 42, i, numAxes);
              return (
                <text
                  key={axis.key}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#a0a0b8"
                  fontSize={11.5}
                  fontFamily="monospace"
                >
                  <tspan x={x} dy="-0.5em">
                    {axis.chartLabel[0]}
                  </tspan>
                  <tspan x={x} dy="1.2em">
                    {axis.chartLabel[1]}
                  </tspan>
                </text>
              );
            })}

            {[0.2, 0.4, 0.6, 0.8, 1.0].map((v) => {
              const [x, y] = hexagonPoint(cx, cy, radius * v, 0, numAxes);
              return (
                <text
                  key={v}
                  x={x + 10}
                  y={y}
                  fill="#666680"
                  fontSize={10}
                  fontFamily="monospace"
                  dominantBaseline="middle"
                >
                  {Math.round(v * 100)}%
                </text>
              );
            })}

            {radarData.map((item) => (
              <g key={item.id}>
                <path
                  d={polygonPath(cx, cy, radius, item.values)}
                  fill={item.color}
                  fillOpacity={0.12}
                  stroke={item.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {item.values.map((v, i) => {
                  const [x, y] = hexagonPoint(cx, cy, radius * v, i, numAxes);
                  return (
                    <circle
                      key={`${item.id}-${AXES[i]?.key ?? i}`}
                      cx={x}
                      cy={y}
                      r={3.5}
                      fill={item.color}
                      stroke="#0a0a0f"
                      strokeWidth={1}
                    />
                  );
                })}
              </g>
            ))}

            <circle cx={cx} cy={cy} r={2.5} fill="#555570" />
          </svg>
        </div>

        <div className="min-h-0 rounded border border-nerv-border bg-nerv-bg-alt/20 p-4 overflow-y-auto">
          <div className="grid gap-4">
            {radarData.map((item) => (
              <section
                key={item.id}
                className="rounded border border-nerv-border/80 bg-nerv-bg/70 p-3"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <div className="min-w-0 text-[14px] leading-snug text-nerv-text-primary line-clamp-2">
                    {item.summary}
                  </div>
                </div>

                <div className="mt-3 grid gap-1">
                  {item.metrics.map((metric) => {
                    const notComputed = metric.scoreLabel.startsWith('—');
                    const pct = Math.round(metric.value * 100);
                    return (
                      // Hover for the description — the bar + raw value carry the
                      // meaning, so the explanation stays out of the way until asked for.
                      <div
                        key={metric.key}
                        title={`${metric.description}\n\nHigh values: ${metric.whatHighMeans}`}
                        className="cursor-help rounded px-2 py-1.5 hover:bg-nerv-bg-alt/40"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[12px] font-mono uppercase tracking-[0.1em] text-nerv-text-secondary">
                            {metric.detailLabel}
                          </span>
                          <span className="shrink-0 text-[10px] font-mono uppercase tracking-wider text-nerv-orange/80">
                            {metric.emphasisLabel}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-nerv-bg-alt/60">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full"
                              style={{ width: `${pct}%`, backgroundColor: item.color }}
                            />
                          </div>
                          <span className="w-6 shrink-0 text-right text-[11px] font-mono tabular-nums text-nerv-text-muted">
                            {notComputed ? '—' : pct}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] font-mono text-nerv-text-muted">
                          {metric.rawLabel}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}

            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-nerv-text-muted">
              <span className="italic">hover a metric for what it means</span>
              {radarData.length < 3 && <span>· shift-click to overlay up to 3</span>}
              {onCompare && radarData.length >= 2 && (
                <button
                  type="button"
                  onClick={() => onCompare(radarData.map((d) => d.id))}
                  className="ml-auto rounded-sm border border-nerv-orange px-3 py-1.5 text-[12px] font-mono uppercase tracking-wider text-nerv-orange transition-colors hover:bg-nerv-orange/10"
                >
                  Compare Selected
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
