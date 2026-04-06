'use client';

import { useMemo, useState, useRef, useCallback } from 'react';
import type { DownstreamEffectsResult, NarrativeCorrelation, TransmissionChain } from '../../lib/api';

const DOMAIN_COLORS: Record<string, string> = {
  economic: 'rgb(var(--nerv-amber))',
  political: 'rgb(var(--nerv-red))',
  social: 'rgb(var(--nerv-purple))',
  market: 'rgb(var(--nerv-green))',
  media: 'rgb(var(--nerv-blue))',
  narrative: 'rgb(var(--nerv-orange))',
};

const DOMAIN_ICONS: Record<string, string> = {
  economic: '\u2234',
  political: '\u2690',
  social: '\u2B22',
  market: '\u25C8',
  media: '\u25CE',
  narrative: '\u25C9',
};

interface EffectsChainProps {
  downstream: DownstreamEffectsResult | null;
  onRunDownstream?: () => void;
  downstreamLoading?: boolean;
}

interface ChainNode {
  id: string;
  label: string;
  domain: string;
  col: number;
  row: number;
}

interface ChainEdge {
  fromId: string;
  toId: string;
  strength: number;
  color: string;
}

export function EffectsChain({
  downstream,
  onRunDownstream,
  downstreamLoading,
}: EffectsChainProps) {
  const [selectedNarrativeId, setSelectedNarrativeId] = useState<string | null>(null);
  const [maxChains, setMaxChains] = useState(10);

  // Zoom/pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanning = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.97 : 1.03;
    setZoom((z) => Math.max(0.3, Math.min(3, z * delta)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan on middle-click or when not clicking a node
    if (e.button === 1 || (e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).tagName === 'path') {
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  const hasData = downstream
    && Array.isArray(downstream.narrativeCorrelations)
    && downstream.narrativeCorrelations.length > 0;

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-center">
          <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
            DOWNSTREAM EFFECTS ANALYSIS
          </div>
          <div className="text-[10px] font-mono text-nerv-text-secondary max-w-[320px] leading-relaxed mb-4">
            Correlates narrative timelines with real-world signals from GDELT, Yahoo Finance, World Bank, and FRED.
          </div>
          {onRunDownstream && (
            <button
              onClick={onRunDownstream}
              disabled={downstreamLoading}
              className={[
                'px-4 py-2 text-[10px] font-mono uppercase tracking-wider border rounded-sm transition-colors',
                downstreamLoading
                  ? 'border-nerv-border text-nerv-text-muted cursor-wait'
                  : 'border-nerv-orange text-nerv-orange hover:bg-nerv-orange/10',
              ].join(' ')}
            >
              {downstreamLoading ? 'ANALYZING...' : 'ANALYZE DOWNSTREAM EFFECTS'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Build the chain visualization from transmission chains
  // Each chain: narrative → intermediary step(s) → final effect
  const { nodes, edges, totalChains, totalSignals, chainsByNarrative } = useMemo(() => {
    const correlations = downstream.narrativeCorrelations ?? [];
    const allSignals = downstream.externalSignals ?? [];

    // Collect all transmission chains with their parent narrative
    const chainsWithNarrative: Array<{ narrativeId: string; narrativeSummary: string; chain: TransmissionChain; strength: number }> = [];
    for (const corr of correlations) {
      const avgStrength = corr.correlatedSignals.length > 0
        ? corr.correlatedSignals.reduce((s, cs) => s + cs.correlationStrength, 0) / corr.correlatedSignals.length
        : 0.5;
      for (const chain of corr.transmissionChains ?? []) {
        if (chain.chain.length >= 2) { // Only chains with at least 2 nodes (narrative + something)
          chainsWithNarrative.push({
            narrativeId: corr.narrativeId,
            narrativeSummary: corr.narrativeSummary,
            chain,
            strength: chain.overallConfidence ?? avgStrength,
          });
        }
      }
    }

    // Sort by strength and take top N
    chainsWithNarrative.sort((a, b) => b.strength - a.strength);
    const topChains = chainsWithNarrative.slice(0, maxChains);

    // Build nodes and edges from chains
    const nodeMap = new Map<string, ChainNode>();
    const allEdges: ChainEdge[] = [];
    let rowCounter = 0;

    for (const { narrativeId, narrativeSummary, chain, strength } of topChains) {
      // Ensure narrative node exists
      const narKey = `nar-${narrativeId}`;
      if (!nodeMap.has(narKey)) {
        nodeMap.set(narKey, {
          id: narKey,
          label: narrativeSummary,
          domain: 'narrative',
          col: 0,
          row: nodeMap.size,
        });
      }

      // Walk the chain: skip the first node if it's the narrative itself
      let prevNodeId = narKey;
      const chainNodes = chain.chain.filter((n) => n.type !== 'narrative');

      for (let ci = 0; ci < chainNodes.length; ci++) {
        const step = chainNodes[ci]!;
        const isLast = ci === chainNodes.length - 1;
        const col = isLast ? 2 : 1; // Last node = signal column, middle = intermediary

        const nodeKey = `${col}-${step.node}`;
        if (!nodeMap.has(nodeKey)) {
          nodeMap.set(nodeKey, {
            id: nodeKey,
            label: step.description || step.node,
            domain: step.type,
            col,
            row: rowCounter++,
          });
        }

        allEdges.push({
          fromId: prevNodeId,
          toId: nodeKey,
          strength,
          color: DOMAIN_COLORS[step.type] ?? 'rgb(var(--nerv-text-muted))',
        });

        prevNodeId = nodeKey;
      }
    }

    // Group rows by parent narrative so connected chains are visually adjacent.
    // For each narrative (col 0), place its downstream nodes (col 1, 2) nearby.
    const colRows: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
    const assigned = new Set<string>();

    for (const { narrativeId } of topChains) {
      const narKey = `nar-${narrativeId}`;
      const narNode = nodeMap.get(narKey);
      if (!narNode || assigned.has(narKey)) continue;

      // Assign narrative row
      narNode.row = colRows[0]!;
      colRows[0]!++;
      assigned.add(narKey);

      // Find all nodes reachable from this narrative via edges
      const reachable = new Set<string>();
      const queue = [narKey];
      while (queue.length > 0) {
        const cur = queue.pop()!;
        for (const edge of allEdges) {
          if (edge.fromId === cur && !reachable.has(edge.toId)) {
            reachable.add(edge.toId);
            queue.push(edge.toId);
          }
        }
      }

      // Assign rows to reachable nodes in col 1 and col 2
      for (const id of reachable) {
        const node = nodeMap.get(id);
        if (!node || assigned.has(id)) continue;
        node.row = colRows[node.col] ?? 0;
        colRows[node.col] = (colRows[node.col] ?? 0) + 1;
        assigned.add(id);
      }
    }

    // Assign any remaining unassigned nodes
    for (const node of nodeMap.values()) {
      if (!assigned.has(node.id)) {
        node.row = colRows[node.col] ?? 0;
        colRows[node.col] = (colRows[node.col] ?? 0) + 1;
      }
    }

    // Group raw chains by narrative for the linear detail view
    const chainsByNarrative = new Map<string, Array<{ summary: string; steps: Array<{ label: string; domain: string }> ; confidence: number }>>();
    for (const { narrativeId, narrativeSummary, chain, strength } of topChains) {
      if (!chainsByNarrative.has(narrativeId)) chainsByNarrative.set(narrativeId, []);
      chainsByNarrative.get(narrativeId)!.push({
        summary: narrativeSummary,
        steps: chain.chain.map((n) => ({ label: n.description || n.node, domain: n.type })),
        confidence: strength,
      });
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges: allEdges,
      totalChains: chainsWithNarrative.length,
      totalSignals: allSignals.length,
      chainsByNarrative,
    };
  }, [downstream, maxChains]);

  // Layout
  const NODE_WIDTH = 280;
  const NODE_HEIGHT = 52;
  const COL_GAP = 140;
  const COL_POSITIONS = [40, 40 + NODE_WIDTH + COL_GAP, 40 + (NODE_WIDTH + COL_GAP) * 2];
  const SVG_WIDTH = COL_POSITIONS[2]! + NODE_WIDTH + 40;
  const ROW_HEIGHT = 64;

  const colCounts = [0, 0, 0];
  for (const n of nodes) colCounts[n.col] = (colCounts[n.col] ?? 0) + 1;
  const maxRows = Math.max(...colCounts, 1);
  const svgHeight = Math.max(250, maxRows * ROW_HEIGHT + 60);

  const getNodeCenter = (col: number, row: number) => ({
    x: COL_POSITIONS[col]! + NODE_WIDTH / 2,
    y: 30 + row * ROW_HEIGHT + NODE_HEIGHT / 2,
  });

  // Build position lookup
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  // Highlight logic
  const highlightedNodeIds = useMemo(() => {
    if (!selectedNarrativeId) return null;
    const narKey = `nar-${selectedNarrativeId}`;
    const ids = new Set<string>([narKey]);
    // Walk edges from this narrative
    const queue = [narKey];
    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const edge of edges) {
        if (edge.fromId === current && !ids.has(edge.toId)) {
          ids.add(edge.toId);
          queue.push(edge.toId);
        }
      }
    }
    return ids;
  }, [selectedNarrativeId, edges]);

  const isHighlighted = (nodeId: string) => !highlightedNodeIds || highlightedNodeIds.has(nodeId);
  const isEdgeHighlighted = (edge: ChainEdge) => !highlightedNodeIds || (highlightedNodeIds.has(edge.fromId) && highlightedNodeIds.has(edge.toId));

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="px-3 py-2 border-b border-nerv-border flex items-center gap-4 shrink-0 flex-wrap">
        <span className="text-[9px] font-mono text-nerv-text-muted uppercase tracking-widest">
          {totalChains} chains / {totalSignals} signals / showing top {Math.min(maxChains, totalChains)}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-[9px] font-mono text-nerv-text-muted uppercase">Show:</label>
          <select
            value={maxChains}
            onChange={(e) => setMaxChains(Number(e.target.value))}
            className="bg-nerv-bg-elevated border border-nerv-border text-nerv-text text-[10px] font-mono px-1.5 py-0.5 rounded-sm"
          >
            <option value={5}>Top 5</option>
            <option value={10}>Top 10</option>
            <option value={20}>Top 20</option>
            <option value={50}>Top 50</option>
          </select>
          {selectedNarrativeId && (
            <button
              onClick={() => setSelectedNarrativeId(null)}
              className="text-[9px] font-mono text-nerv-orange hover:underline ml-2"
            >
              CLEAR FILTER
            </button>
          )}
        </div>
      </div>

      {!selectedNarrativeId && nodes.length > 0 && (
        <div className="px-3 py-1 text-[9px] font-mono text-nerv-text-muted border-b border-nerv-border/50 shrink-0">
          Click a narrative to trace its causal chain: narrative → intermediary cause → real-world effect
        </div>
      )}

      {/* Zoom controls */}
      <div className="px-3 py-1 border-b border-nerv-border/50 flex items-center gap-2 shrink-0">
        <button onClick={() => setZoom((z) => Math.min(3, z * 1.2))} className="text-[10px] font-mono text-nerv-text-muted hover:text-nerv-text px-1">+</button>
        <span className="text-[9px] font-mono text-nerv-text-muted">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.max(0.3, z * 0.8))} className="text-[10px] font-mono text-nerv-text-muted hover:text-nerv-text px-1">-</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="text-[9px] font-mono text-nerv-text-muted hover:text-nerv-text ml-1">RESET</button>
        <span className="text-[9px] font-mono text-nerv-text-muted/50 ml-2">scroll to zoom, drag to pan</span>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg
          width={SVG_WIDTH}
          height={svgHeight}
          viewBox={`0 0 ${SVG_WIDTH} ${svgHeight}`}
          className="block"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {/* Column headers */}
          <text x={COL_POSITIONS[0]! + NODE_WIDTH / 2} y={16} textAnchor="middle"
            className="text-[9px] font-mono uppercase tracking-widest" fill="var(--nerv-text-muted)">
            NARRATIVES
          </text>
          <text x={COL_POSITIONS[1]! + NODE_WIDTH / 2} y={16} textAnchor="middle"
            className="text-[9px] font-mono uppercase tracking-widest" fill="var(--nerv-text-muted)">
            CAUSAL MECHANISM
          </text>
          <text x={COL_POSITIONS[2]! + NODE_WIDTH / 2} y={16} textAnchor="middle"
            className="text-[9px] font-mono uppercase tracking-widest" fill="var(--nerv-text-muted)">
            REAL-WORLD EFFECT
          </text>

          {/* Edges */}
          {edges.map((edge, i) => {
            const fromNode = nodeById.get(edge.fromId);
            const toNode = nodeById.get(edge.toId);
            if (!fromNode || !toNode) return null;
            const from = getNodeCenter(fromNode.col, fromNode.row);
            const to = getNodeCenter(toNode.col, toNode.row);
            const midX = (from.x + to.x) / 2;
            const highlighted = isEdgeHighlighted(edge);

            return (
              <path
                key={i}
                d={`M${from.x + NODE_WIDTH / 2},${from.y} C${midX},${from.y} ${midX},${to.y} ${to.x - NODE_WIDTH / 2},${to.y}`}
                fill="none"
                stroke={edge.color}
                strokeWidth={1 + edge.strength * 2}
                strokeOpacity={highlighted ? 0.4 + edge.strength * 0.4 : 0.06}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const y = 30 + node.row * ROW_HEIGHT;
            const color = DOMAIN_COLORS[node.domain] ?? 'rgb(var(--nerv-text-muted))';
            const highlighted = isHighlighted(node.id);
            const isNarrative = node.col === 0;
            const isSelected = node.id === `nar-${selectedNarrativeId}`;

            return (
              <g
                key={node.id}
                style={{ cursor: isNarrative ? 'pointer' : 'default', opacity: highlighted ? 1 : 0.15 }}
                onClick={isNarrative ? () => {
                  const narId = node.id.replace('nar-', '');
                  setSelectedNarrativeId(selectedNarrativeId === narId ? null : narId);
                } : undefined}
              >
                <rect
                  x={COL_POSITIONS[node.col]}
                  y={y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx={3}
                  fill={isSelected ? 'rgba(255,107,43,0.1)' : '#1a1a2e'}
                  stroke={isSelected ? '#FF6B2B' : color}
                  strokeWidth={isSelected ? 2 : 1}
                  strokeOpacity={0.6}
                />
                <foreignObject
                  x={COL_POSITIONS[node.col]! + 6}
                  y={y + 3}
                  width={NODE_WIDTH - 12}
                  height={NODE_HEIGHT - 6}
                >
                  <div
                    className="text-[9px] font-mono leading-tight"
                    style={{ color: highlighted ? 'rgb(var(--nerv-text))' : 'rgb(var(--nerv-text-muted))' }}
                  >
                    <span style={{ color }}>{DOMAIN_ICONS[node.domain] ?? '\u25CB'}</span>{' '}
                    {node.label}
                    <div className="text-[8px] mt-0.5" style={{ color: 'rgb(var(--nerv-text-muted))' }}>
                      {node.domain.toUpperCase()}
                    </div>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Linear chain detail — shows when a narrative is selected */}
      {selectedNarrativeId && chainsByNarrative.has(selectedNarrativeId) && (
        <div className="shrink-0 border-t border-nerv-orange/30 bg-nerv-bg-panel max-h-[40%] overflow-y-auto">
          <div className="px-3 py-2 border-b border-nerv-border flex items-center justify-between">
            <span className="text-[9px] font-mono uppercase tracking-widest text-nerv-orange">
              CAUSAL CHAINS — {chainsByNarrative.get(selectedNarrativeId)!.length} chain(s)
            </span>
            <button
              onClick={() => setSelectedNarrativeId(null)}
              className="text-[9px] font-mono text-nerv-text-muted hover:text-nerv-text"
            >
              CLOSE
            </button>
          </div>
          <div className="p-3 space-y-3">
            {chainsByNarrative.get(selectedNarrativeId)!.map((chain, ci) => (
              <div key={ci} className="space-y-1">
                <div className="text-[9px] font-mono text-nerv-text-muted">
                  Chain {ci + 1} — confidence: {(chain.confidence * 100).toFixed(0)}%
                </div>
                <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
                  {chain.steps.map((step, si) => {
                    const color = DOMAIN_COLORS[step.domain] ?? 'rgb(var(--nerv-text-muted))';
                    const isLast = si === chain.steps.length - 1;
                    return (
                      <div key={si} className="flex items-stretch shrink-0">
                        <div
                          className="px-3 py-2 border rounded-sm min-w-[160px] max-w-[280px]"
                          style={{
                            borderColor: color,
                            borderLeftWidth: 3,
                            backgroundColor: `color-mix(in srgb, ${color} 3%, transparent)`,
                          }}
                        >
                          <div className="text-[8px] font-mono uppercase tracking-wider mb-0.5" style={{ color }}>
                            {step.domain === 'narrative' ? 'NARRATIVE' : step.domain.toUpperCase()}
                          </div>
                          <div className="text-[10px] font-mono text-nerv-text leading-snug break-words">
                            {step.label}
                          </div>
                        </div>
                        {!isLast && (
                          <div className="flex items-center px-1 shrink-0">
                            <span className="text-nerv-orange text-sm">{'\u2192'}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
