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
}

// 6 axes
const AXES = [
  { key: 'velocity', label: 'VELOCITY' },
  { key: 'reach', label: 'REACH' },
  { key: 'sentiment', label: 'SENTIMENT MAG' },
  { key: 'deviation', label: 'DEVIATION' },
  { key: 'platformDiv', label: 'PLATFORM DIV' },
  { key: 'authorDiv', label: 'AUTHOR DIV' },
] as const;

const OVERLAY_COLORS = ['#FF6B2B', '#0ea5e9', '#00FF41'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeAxes(
  narrative: AnalyzedNarrative,
  maxVelocity: number,
  maxPosts: number,
  maxPlatforms: number,
  deviationMap: Map<string, number>,
): number[] {
  const velocity = maxVelocity > 0 ? Math.min(narrative.velocity.postsPerHour / maxVelocity, 1) : 0;
  const reach = maxPosts > 0 ? Math.min(narrative.postIndices.length / maxPosts, 1) : 0;
  const sentimentMag = Math.min(Math.abs(narrative.avgSentiment), 1);
  const deviation = deviationMap.get(narrative.id) ?? 0;
  const platformCount = Object.keys(narrative.platforms).length;
  const platformDiv = maxPlatforms > 0 ? platformCount / maxPlatforms : 0;
  const uniqueAuthors = narrative.authors.length;
  const totalPosts = narrative.postIndices.length || 1;
  const authorDiv = Math.min(uniqueAuthors / totalPosts, 1);

  return [velocity, reach, sentimentMag, deviation, platformDiv, authorDiv];
}

function hexagonPoint(cx: number, cy: number, radius: number, index: number, total: number): [number, number] {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
}

function polygonPath(cx: number, cy: number, radius: number, values: number[]): string {
  const n = values.length;
  return values
    .map((v, i) => {
      const [x, y] = hexagonPoint(cx, cy, radius * v, i, n);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ') + 'Z';
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
    paths.push(pts.join(' ') + 'Z');
  }
  return paths.join(' ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NarrativeRadar({ narratives, selectedIds, deviations }: NarrativeRadarProps) {
  const radarData = useMemo(() => {
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

    return toShow.map((n, i) => ({
      id: n.id,
      summary: n.summary,
      values: computeAxes(n, maxVelocity, maxPosts, maxPlatforms, devMap),
      color: OVERLAY_COLORS[i % OVERLAY_COLORS.length],
    }));
  }, [narratives, selectedIds, deviations]);

  if (!radarData || radarData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-nerv-text-muted text-3xl mb-3">{'\u25C9'}</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1">
            NARRATIVE RADAR
          </div>
          <div className="text-[10px] font-mono text-nerv-text-secondary max-w-[280px] leading-relaxed">
            Select narratives from the left panel to display multi-dimensional radar analysis.
            Shift-click to overlay up to 3 narratives.
          </div>
        </div>
      </div>
    );
  }

  const size = 400;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 60;
  const numAxes = AXES.length;

  return (
    <div className="h-full flex flex-col items-center justify-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block max-w-full max-h-[calc(100%-60px)]"
      >
        {/* Background */}
        <rect width={size} height={size} fill="#0a0a0f" />

        {/* Hexagonal grid lines */}
        <path
          d={hexGridPath(cx, cy, radius, 5)}
          fill="none"
          stroke="#1a1a2e"
          strokeWidth={0.5}
        />

        {/* Axis lines */}
        {AXES.map((_, i) => {
          const [x, y] = hexagonPoint(cx, cy, radius, i, numAxes);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke="#1a1a2e"
              strokeWidth={0.5}
            />
          );
        })}

        {/* Axis labels */}
        {AXES.map((axis, i) => {
          const [x, y] = hexagonPoint(cx, cy, radius + 28, i, numAxes);
          return (
            <text
              key={axis.key}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#8888a0"
              fontSize={8}
              fontFamily="monospace"
            >
              {axis.label}
            </text>
          );
        })}

        {/* Scale labels on first axis */}
        {[0.2, 0.4, 0.6, 0.8, 1.0].map((v) => {
          const [x, y] = hexagonPoint(cx, cy, radius * v, 0, numAxes);
          return (
            <text
              key={v}
              x={x + 8}
              y={y}
              fill="#555570"
              fontSize={7}
              fontFamily="monospace"
              dominantBaseline="middle"
            >
              {(v * 100).toFixed(0)}
            </text>
          );
        })}

        {/* Narrative polygons */}
        {radarData.map((item) => (
          <g key={item.id}>
            <path
              d={polygonPath(cx, cy, radius, item.values)}
              fill={item.color}
              fillOpacity={0.12}
              stroke={item.color}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
            {/* Dots at vertices */}
            {item.values.map((v, i) => {
              const [x, y] = hexagonPoint(cx, cy, radius * v, i, numAxes);
              return (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={3}
                  fill={item.color}
                  stroke={item.color}
                  strokeWidth={1}
                />
              );
            })}
          </g>
        ))}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={2} fill="#555570" />
      </svg>

      {/* Legend */}
      <div className="px-3 py-2 flex flex-wrap items-center gap-4 justify-center">
        {radarData.map((item) => (
          <div key={item.id} className="flex items-start gap-1.5 max-w-[300px]">
            <span
              className="inline-block w-3 h-1 rounded-sm shrink-0 mt-1"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[10px] font-mono text-nerv-text-secondary leading-snug">
              {item.summary}
            </span>
          </div>
        ))}
        {radarData.length < 3 && (
          <span className="text-[8px] font-mono text-nerv-text-muted italic">
            Shift-click narratives to compare (max 3)
          </span>
        )}
      </div>
    </div>
  );
}
