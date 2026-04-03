'use client';

import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { InvestigationResult } from '../../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PropagationFlowProps {
  investigation: InvestigationResult | null;
}

const PLATFORM_COLORS: Record<string, string> = {
  twitter: '#1DA1F2',
  reddit: '#FF5700',
  youtube: '#FF0000',
  facebook: '#1877F2',
  instagram: '#E4405F',
  tiktok: '#00F2EA',
  news: '#FFD700',
  web: '#8888a0',
};

const PLATFORM_Y_LANES: Record<string, number> = {
  twitter: 0,
  reddit: 1,
  youtube: 2,
  facebook: 3,
  instagram: 4,
  tiktok: 5,
  news: 6,
  web: 7,
};

// ---------------------------------------------------------------------------
// Hexagon path helper
// ---------------------------------------------------------------------------

function hexPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
  }
  return `M${pts.join('L')}Z`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PropagationFlow({ investigation }: PropagationFlowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef(0);

  // Parse data into positioned nodes
  const { nodes, edges, platforms, coordClusters } = useMemo(() => {
    if (!investigation) return { nodes: [], edges: [], platforms: [], coordClusters: [] };

    const users = investigation.users ?? [];
    const origin = investigation.originAnalysis;
    const coordination = investigation.coordination;

    // Get all unique platforms
    const platformSet = new Set<string>();
    for (const u of users) {
      platformSet.add(u.user.platform.toLowerCase());
    }
    if (origin?.firstPlatform) platformSet.add(origin.firstPlatform.toLowerCase());
    const platformList = Array.from(platformSet).sort(
      (a, b) => (PLATFORM_Y_LANES[a] ?? 99) - (PLATFORM_Y_LANES[b] ?? 99),
    );

    // Assign lane indices
    const laneMap = new Map<string, number>();
    platformList.forEach((p, i) => laneMap.set(p, i));

    // Compute time range
    const timestamps: number[] = [];
    for (const u of users) {
      const t = u.adoptionTimestamp ?? u.user.firstMention;
      if (t) timestamps.push(new Date(t).getTime());
    }
    if (origin?.firstTimestamp) timestamps.push(new Date(origin.firstTimestamp).getTime());
    if (timestamps.length === 0) return { nodes: [], edges: [], platforms: platformList, coordClusters: [] };

    const minT = Math.min(...timestamps);
    const maxT = Math.max(...timestamps);
    const timeRange = maxT - minT || 1;

    // Build nodes
    const nodeList: Array<{
      handle: string;
      platform: string;
      x: number;
      y: number;
      r: number;
      isOrigin: boolean;
      isBot: boolean;
      color: string;
      likelySource: string | null;
    }> = [];

    const handleIndex = new Map<string, number>();
    for (const u of users) {
      const t = new Date(u.adoptionTimestamp ?? u.user.firstMention ?? Date.now()).getTime();
      const plat = u.user.platform.toLowerCase();
      const lane = laneMap.get(plat) ?? 0;
      const xNorm = (t - minT) / timeRange;
      const isOrigin = u.user.handle === origin?.firstMover;
      const isBot = u.flags.includes('potential_bot') || (u.botScore?.botProbability ?? 0) > 0.6;
      const baseR = 8 + Math.min(u.influenceScore * 20, 20);

      handleIndex.set(u.user.handle, nodeList.length);
      nodeList.push({
        handle: u.user.handle,
        platform: plat,
        x: xNorm,
        y: lane,
        r: baseR,
        isOrigin,
        isBot,
        color: PLATFORM_COLORS[plat] ?? '#8888a0',
        likelySource: u.likelySource,
      });
    }

    // Build edges from likelySource
    const edgeList: Array<{ from: number; to: number }> = [];
    for (let i = 0; i < nodeList.length; i++) {
      const src = nodeList[i]!.likelySource;
      if (src && handleIndex.has(src)) {
        edgeList.push({ from: handleIndex.get(src)!, to: i });
      }
    }

    // Coordination clusters
    const clusters = (coordination?.clusters ?? []).map((c) => ({
      userIndices: c.users
        .map((u) => handleIndex.get(u))
        .filter((i): i is number => i !== undefined),
      pattern: c.pattern,
      confidence: c.confidence,
    }));

    return { nodes: nodeList, edges: edgeList, platforms: platformList, coordClusters: clusters };
  }, [investigation]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || nodes.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const marginLeft = 80;
    const marginRight = 30;
    const marginTop = 30;
    const marginBottom = 30;
    const plotW = w - marginLeft - marginRight;
    const plotH = h - marginTop - marginBottom;

    const laneCount = platforms.length || 1;
    const laneH = plotH / laneCount;

    const t = timeRef.current;

    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, w, h);

    // Grid: platform lanes
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i < platforms.length; i++) {
      const y = marginTop + i * laneH + laneH / 2;
      // Lane line
      ctx.strokeStyle = '#1a1a2e';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(marginLeft, y);
      ctx.lineTo(w - marginRight, y);
      ctx.stroke();
      // Label
      ctx.fillStyle = '#555570';
      ctx.fillText(platforms[i]!.toUpperCase(), marginLeft - 8, y + 3);
    }

    // Coordination cluster boundaries
    for (const cluster of coordClusters) {
      if (cluster.userIndices.length < 2) continue;
      const clusterNodes = cluster.userIndices.map((i) => nodes[i]!);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of clusterNodes) {
        const nx = marginLeft + n!.x * plotW;
        const ny = marginTop + n!.y * laneH + laneH / 2;
        minX = Math.min(minX, nx - n!.r - 10);
        maxX = Math.max(maxX, nx + n!.r + 10);
        minY = Math.min(minY, ny - n!.r - 10);
        maxY = Math.max(maxY, ny + n!.r + 10);
      }
      ctx.strokeStyle = `rgba(233, 69, 96, ${0.3 + 0.1 * Math.sin(t * 2)})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      ctx.setLineDash([]);
      // Label
      ctx.fillStyle = 'rgba(233, 69, 96, 0.5)';
      ctx.font = '7px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`COORD: ${cluster.pattern.slice(0, 20)}`, minX + 2, minY - 3);
    }

    // Edges
    for (const edge of edges) {
      const from = nodes[edge.from]!;
      const to = nodes[edge.to]!;
      const fx = marginLeft + from.x * plotW;
      const fy = marginTop + from.y * laneH + laneH / 2;
      const tx = marginLeft + to.x * plotW;
      const ty = marginTop + to.y * laneH + laneH / 2;

      ctx.strokeStyle = 'rgba(255, 107, 43, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      // Arrow head
      const angle = Math.atan2(ty - fy, tx - fx);
      const arrLen = 6;
      ctx.fillStyle = 'rgba(255, 107, 43, 0.4)';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - arrLen * Math.cos(angle - 0.4), ty - arrLen * Math.sin(angle - 0.4));
      ctx.lineTo(tx - arrLen * Math.cos(angle + 0.4), ty - arrLen * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
    }

    // Nodes (hexagons)
    for (const node of nodes) {
      const nx = marginLeft + node.x * plotW;
      const ny = marginTop + node.y * laneH + laneH / 2;

      // Hexagon path
      const path = new Path2D();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const px = nx + node.r * Math.cos(angle);
        const py = ny + node.r * Math.sin(angle);
        if (i === 0) path.moveTo(px, py);
        else path.lineTo(px, py);
      }
      path.closePath();

      // Fill
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = node.color;
      ctx.fill(path);
      ctx.globalAlpha = 1;

      // Stroke
      ctx.strokeStyle = node.color;
      ctx.lineWidth = 1.5;
      ctx.stroke(path);

      // Origin glow
      if (node.isOrigin) {
        ctx.save();
        ctx.shadowColor = '#FF6B2B';
        ctx.shadowBlur = 12 + 4 * Math.sin(t * 3);
        ctx.strokeStyle = '#FF6B2B';
        ctx.lineWidth = 2;
        ctx.stroke(path);
        ctx.restore();
      }

      // Bot pulsing border
      if (node.isBot) {
        ctx.save();
        ctx.strokeStyle = `rgba(233, 69, 96, ${0.5 + 0.5 * Math.sin(t * 4)})`;
        ctx.lineWidth = 2;
        ctx.stroke(path);
        ctx.restore();
      }

      // Handle label
      ctx.fillStyle = '#e0e0e8';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        node.handle.length > 10 ? `${node.handle.slice(0, 9)}...` : node.handle,
        nx,
        ny + node.r + 10,
      );
    }

    // Time axis
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginLeft, h - marginBottom + 5);
    ctx.lineTo(w - marginRight, h - marginBottom + 5);
    ctx.stroke();

    ctx.fillStyle = '#555570';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TIME \u2192', w / 2, h - 5);
  }, [nodes, edges, platforms, coordClusters]);

  // Animation loop
  useEffect(() => {
    if (nodes.length === 0) return undefined;
    let running = true;
    const animate = () => {
      if (!running) return;
      timeRef.current += 0.016;
      draw();
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw, nodes.length]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  if (!investigation) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-nerv-text-muted text-3xl mb-3">{'\u25CE'}</div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-nerv-text-muted mb-2">
            PROPAGATION FLOW
          </div>
          <div className="text-[11px] font-mono text-nerv-text-secondary max-w-[320px] leading-relaxed">
            Shows how a narrative spreads from origin through amplifiers across platforms.
          </div>
          <div className="text-[11px] font-mono text-nerv-orange mt-3 max-w-[320px] leading-relaxed">
            {'\u2192'} Select a narrative in the left panel, then click the <span className="font-bold">INVESTIGATE THIS NARRATIVE</span> button in the right panel.
          </div>
        </div>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-nerv-text-muted text-3xl mb-3">{'\u25CE'}</div>
          <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1">
            INSUFFICIENT DATA
          </div>
          <div className="text-[10px] font-mono text-nerv-text-secondary max-w-[280px] leading-relaxed">
            Investigation completed but no propagation data could be extracted.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div ref={containerRef} className="flex-1 relative min-h-0">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
      {/* Legend bar */}
      <div className="shrink-0 px-3 py-1.5 border-t border-nerv-border bg-nerv-bg flex items-center gap-4 flex-wrap">
        <span className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted">LEGEND:</span>
        <span className="text-[9px] font-mono text-nerv-orange flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full bg-nerv-orange shadow-[0_0_6px_rgba(255,107,43,0.6)]" />
          ORIGIN
        </span>
        <span className="text-[9px] font-mono text-nerv-red flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full border border-nerv-red animate-pulse" />
          BOT
        </span>
        <span className="text-[9px] font-mono text-nerv-red/60 flex items-center gap-1">
          <span className="inline-block w-3 h-2 border border-dashed border-nerv-red/40" />
          COORD CLUSTER
        </span>
        {platforms.map((p) => (
          <span key={p} className="text-[9px] font-mono flex items-center gap-1">
            <span
              className="inline-block w-2 h-2"
              style={{ backgroundColor: PLATFORM_COLORS[p] ?? '#8888a0' }}
            />
            <span style={{ color: PLATFORM_COLORS[p] ?? '#8888a0' }}>{p.toUpperCase()}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
