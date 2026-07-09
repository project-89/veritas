'use client';

import { useMemo } from 'react';
import type { NarrativeLineage } from '../../lib/api';
import { NervBadge } from './nerv-badge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenealogyPanelProps {
  lineages: NarrativeLineage[];
  onRefresh?: () => void;
  refreshing?: boolean;
}

interface GenealogySnapshot {
  id: string;
  timestamp: string;
}

interface GenealogyNode {
  snapshotId: string;
  snapshotTimestamp: string;
  narrativeId: string;
  summary: string;
  postCount: number;
  avgSentiment: number;
  similarity: number;
  cx: number;
  cy: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: '#0ea5e9',
  growing: '#00FF41',
  stable: '#8888a0',
  fading: '#f59e0b',
  died: '#e94560',
};

const STATUS_BADGE: Record<string, 'blue' | 'green' | 'muted' | 'amber' | 'red'> = {
  active: 'blue',
  growing: 'green',
  stable: 'muted',
  fading: 'amber',
  died: 'red',
};

const EVENT_ICONS: Record<string, string> = {
  emerged: '\u25C9',
  grew: '\u25B2',
  shrank: '\u25BC',
  split: '\u2B21',
  merged: '\u2B22',
  died: '\u2716',
};

const EVENT_COLORS: Record<string, string> = {
  emerged: '#0ea5e9',
  grew: '#00FF41',
  shrank: '#f59e0b',
  split: '#FF6B2B',
  merged: '#a855f7',
  died: '#e94560',
};

function sentimentColor(s: number): string {
  if (s > 0.2) return '#00FF41';
  if (s < -0.2) return '#e94560';
  return '#8888a0';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenealogyPanel({
  lineages,
  onRefresh,
  refreshing,
}: GenealogyPanelProps) {
  void onRefresh;
  void refreshing;

  // Need multiple snapshots (at least 1 lineage with >1 history entries)
  const hasMultipleSnapshots = lineages.length > 0 && lineages.some((l) => l.history.length > 1);

  // Compute timeline columns from all snapshots
  const allSnapshots = useMemo<GenealogySnapshot[]>(() => {
    const snapshotMap = new Map<string, GenealogySnapshot>();
    for (const l of lineages) {
      for (const h of l.history) {
        if (!snapshotMap.has(h.snapshotId)) {
          snapshotMap.set(h.snapshotId, {
            id: h.snapshotId,
            timestamp: h.snapshotTimestamp,
          });
        }
      }
    }
    return Array.from(snapshotMap.values()).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }, [lineages]);

  const colWidth = 160;
  const rowHeight = 80;
  const headerHeight = 50;
  const eventRowHeight = 30;
  const leftPadding = 30;
  const svgWidth = leftPadding + allSnapshots.length * colWidth + 40;
  const svgHeight = headerHeight + lineages.length * rowHeight + eventRowHeight + 20;

  // Build a lookup: snapshotId -> column index
  const snapIndexMap = new Map(allSnapshots.map((s, i) => [s.id, i]));

  if (!hasMultipleSnapshots) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-nerv-text-muted text-3xl mb-3">{'\u2394'}</div>
          <div className="text-[12px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
            NARRATIVE GENEALOGY
          </div>
          <div className="text-[12px] font-mono text-nerv-text-secondary max-w-[320px] leading-relaxed mb-4">
            Genealogy tracks narrative evolution across multiple scans. Use the REFRESH button above
            to create another snapshot, then genealogy data will appear here.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto nerv-scrollbar">
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="block"
        role="img"
        aria-label="Narrative genealogy timeline"
      >
        <title>Narrative genealogy timeline</title>
        {/* Defs for glow */}
        <defs>
          <filter id="gen-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Column headers: snapshot timestamps */}
        {allSnapshots.map((snap, ci) => {
          const x = leftPadding + ci * colWidth + colWidth / 2;
          return (
            <g key={snap.id}>
              {/* Vertical grid line */}
              <line
                x1={x}
                y1={headerHeight}
                x2={x}
                y2={svgHeight - eventRowHeight}
                stroke="#1a1a2e"
                strokeWidth={1}
              />
              <text
                x={x}
                y={20}
                textAnchor="middle"
                fill="#8888a0"
                fontSize={9}
                fontFamily="monospace"
              >
                {new Date(snap.timestamp).toLocaleDateString()}
              </text>
              <text
                x={x}
                y={32}
                textAnchor="middle"
                fill="#555570"
                fontSize={8}
                fontFamily="monospace"
              >
                {new Date(snap.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </text>
            </g>
          );
        })}

        {/* Narrative lanes */}
        {lineages.map((lineage, li) => {
          const laneY = headerHeight + li * rowHeight + rowHeight / 2;
          const statusColor = STATUS_COLORS[lineage.status] ?? '#8888a0';

          // Build nodes for this lineage
          const nodes = lineage.history
            .map((h) => {
              const ci = snapIndexMap.get(h.snapshotId);
              if (ci === undefined) return null;
              return { ...h, cx: leftPadding + ci * colWidth + colWidth / 2, cy: laneY };
            })
            .filter((node): node is GenealogyNode => node != null);

          // Max post count for sizing
          const maxPost = Math.max(...nodes.map((n) => n.postCount), 1);

          return (
            <g key={lineage.currentId}>
              {/* Horizontal lane line */}
              <line
                x1={leftPadding}
                y1={laneY}
                x2={svgWidth - 40}
                y2={laneY}
                stroke="#1a1a2e"
                strokeWidth={1}
                strokeDasharray="4 4"
              />

              {/* Connection lines between consecutive nodes */}
              {nodes.map((node, ni) => {
                if (ni === 0) return null;
                const prev = nodes[ni - 1];
                if (!prev) return null;
                const isSameNarrative = node.similarity > 0.7;
                return (
                  <line
                    key={`${prev.snapshotId}-${node.snapshotId}`}
                    x1={prev.cx}
                    y1={prev.cy}
                    x2={node.cx}
                    y2={node.cy}
                    stroke={statusColor}
                    strokeWidth={2}
                    strokeDasharray={isSameNarrative ? 'none' : '6 3'}
                    opacity={0.6}
                  />
                );
              })}

              {/* Nodes */}
              {nodes.map((node) => {
                const r = 6 + (node.postCount / maxPost) * 14;
                const fillColor = sentimentColor(node.avgSentiment);
                return (
                  <g key={`${node.snapshotId}-${node.narrativeId}`}>
                    <circle
                      cx={node.cx}
                      cy={node.cy}
                      r={r}
                      fill={fillColor}
                      fillOpacity={0.25}
                      stroke={fillColor}
                      strokeWidth={1.5}
                    />
                    <text
                      x={node.cx}
                      y={node.cy + 3}
                      textAnchor="middle"
                      fill="#e0e0e8"
                      fontSize={8}
                      fontFamily="monospace"
                    >
                      {node.postCount}
                    </text>
                  </g>
                );
              })}

              {/* Lane label (leftmost) */}
              <foreignObject
                x={leftPadding + (nodes[0]?.cx ?? leftPadding) - leftPadding - 2}
                y={laneY - rowHeight / 2 + 2}
                width={colWidth - 10}
                height={16}
              >
                <div
                  className="text-[10px] font-mono text-nerv-text-secondary truncate leading-none"
                  title={lineage.currentSummary}
                >
                  {lineage.currentSummary.slice(0, 40)}...
                </div>
              </foreignObject>
            </g>
          );
        })}

        {/* Event labels at the bottom */}
        {lineages.flatMap((lineage) =>
          lineage.events.map((evt, ei) => {
            // Find the closest snapshot column by timestamp
            let bestCol = 0;
            let bestDist = Infinity;
            const evtTime = new Date(evt.timestamp).getTime();
            for (const [, idx] of snapIndexMap) {
              const snapshot = allSnapshots[idx];
              if (!snapshot) continue;
              const snapTime = new Date(snapshot.timestamp).getTime();
              const dist = Math.abs(snapTime - evtTime);
              if (dist < bestDist) {
                bestDist = dist;
                bestCol = idx;
              }
            }
            const x = leftPadding + bestCol * colWidth + colWidth / 2 + ei * 12;
            const y = svgHeight - eventRowHeight + 12;
            const color = EVENT_COLORS[evt.type] ?? '#8888a0';
            return (
              <g key={`${lineage.currentId}-${evt.type}-${evt.timestamp}`}>
                <text
                  x={x}
                  y={y}
                  textAnchor="middle"
                  fill={color}
                  fontSize={10}
                  fontFamily="monospace"
                >
                  {EVENT_ICONS[evt.type] ?? '\u25CF'}
                </text>
                <text
                  x={x}
                  y={y + 12}
                  textAnchor="middle"
                  fill={color}
                  fontSize={7}
                  fontFamily="monospace"
                  opacity={0.7}
                >
                  {evt.type.toUpperCase()}
                </text>
              </g>
            );
          }),
        )}
      </svg>

      {/* Legend */}
      <div className="px-3 py-2 border-t border-nerv-border flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-mono uppercase tracking-widest text-nerv-text-muted mr-1">
          STATUS:
        </span>
        {Object.entries(STATUS_BADGE).map(([status, variant]) => (
          <NervBadge key={status} label={status.toUpperCase()} variant={variant} size="sm" />
        ))}
        <span className="text-[11px] font-mono uppercase tracking-widest text-nerv-text-muted ml-3 mr-1">
          EVENTS:
        </span>
        {Object.entries(EVENT_ICONS).map(([type, icon]) => (
          <span key={type} className="text-[11px] font-mono" style={{ color: EVENT_COLORS[type] }}>
            {icon} {type}
          </span>
        ))}
      </div>
    </div>
  );
}
