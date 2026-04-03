'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import type { AnalyzedNarrative, RawPost } from '../../lib/api';

interface TemporalHeatmapProps {
  narratives: AnalyzedNarrative[];
  posts: RawPost[];
  selectedNarrativeId: string | null;
  onSelectNarrative: (id: string | null) => void;
}

interface TooltipData {
  x: number;
  y: number;
  narrativeSummary: string;
  timeLabel: string;
  postCount: number;
  avgSentiment: number;
  topAuthor: string;
}

// Interpolate sentiment to color: red (-1) -> gray (0) -> green (+1)
function sentimentToColor(sentiment: number): string {
  const s = Math.max(-1, Math.min(1, sentiment));
  if (s > 0) {
    const g = Math.round(255 * s);
    return `rgb(${Math.round(40 * (1 - s))}, ${Math.min(255, 65 + g)}, ${Math.round(65 * (1 - s))})`;
  }
  if (s < 0) {
    const r = Math.round(233 * Math.abs(s));
    return `rgb(${Math.min(233, 69 + r)}, ${Math.round(69 * (1 - Math.abs(s)))}, ${Math.round(96 * (1 - Math.abs(s)))})`;
  }
  return 'rgb(85, 85, 112)';
}

export function TemporalHeatmap({
  narratives,
  posts,
  selectedNarrativeId,
  onSelectNarrative,
}: TemporalHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });

  // Layout constants
  const LABEL_WIDTH = 80;
  const TOP_MARGIN = 24;
  const BOTTOM_MARGIN = 40;
  const RIGHT_MARGIN = 8;
  const ROW_HEIGHT = 40;
  const CELL_PADDING = 1;

  // Compute time buckets
  const { buckets, bucketLabels, grid, postsByNarrativeBucket } = useMemo(() => {
    if (narratives.length === 0 || posts.length === 0) {
      return { buckets: [], bucketLabels: [], grid: [], postsByNarrativeBucket: new Map() };
    }

    const allTimestamps = posts.map((p) => new Date(p.timestamp).getTime()).sort((a, b) => a - b);

    // Use the interquartile range of timestamps to determine the natural window,
    // filtering out outlier posts that are way outside the scan period.
    // This auto-adapts to any scan window (7d, 30d, 90d, etc.)
    const q1Idx = Math.floor(allTimestamps.length * 0.05);
    const q3Idx = Math.floor(allTimestamps.length * 0.95);
    const q1 = allTimestamps[q1Idx]!;
    const q3 = allTimestamps[q3Idx]!;
    const iqr = q3 - q1;

    // Extend slightly beyond the IQR to capture edge posts, but not wild outliers
    const minTime = Math.max(allTimestamps[0]!, q1 - iqr * 1.5);
    const maxTime = Math.min(allTimestamps[allTimestamps.length - 1]!, q3 + iqr * 1.5);
    const range = Math.max(maxTime - minTime, 3600000); // at least 1 hour

    // Choose bucket count based on range
    let numBuckets: number;
    if (range < 86400000) numBuckets = 12; // < 1 day: 2hr buckets
    else if (range < 604800000) numBuckets = 14; // < 1 week: 12hr buckets
    else numBuckets = Math.min(20, Math.ceil(range / 86400000)); // daily

    const bucketSize = range / numBuckets || 1;
    const bkts: Array<{ start: number; end: number }> = [];
    const labels: string[] = [];

    for (let i = 0; i < numBuckets; i++) {
      const start = minTime + i * bucketSize;
      const end = start + bucketSize;
      bkts.push({ start, end });
      const d = new Date(start);
      labels.push(
        range < 86400000
          ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
      );
    }

    // Build grid: narratives x buckets
    const byNB = new Map<string, RawPost[]>();
    const gridData: Array<Array<{ count: number; avgSentiment: number; topAuthor: string }>> = [];

    for (const narrative of narratives) {
      const row: Array<{ count: number; avgSentiment: number; topAuthor: string }> = [];
      const narrativePosts = narrative.postIndices.map((idx) => posts[idx]).filter((p): p is RawPost => Boolean(p));

      for (let bi = 0; bi < numBuckets; bi++) {
        const bucket = bkts[bi]!;
        const cellPosts = narrativePosts.filter((p) => {
          const t = new Date(p.timestamp).getTime();
          return t >= bucket.start && t < bucket.end;
        });

        const key = `${narrative.id}:${bi}`;
        byNB.set(key, cellPosts);

        const count = cellPosts.length;
        const avgSentiment =
          count > 0
            ? cellPosts.reduce((s, p) => s + (p.sentiment?.score ?? 0), 0) / count
            : 0;

        // top author
        const authorCounts = new Map<string, number>();
        for (const p of cellPosts) {
          const h = p.authorHandle || p.authorName || 'unknown';
          authorCounts.set(h, (authorCounts.get(h) ?? 0) + 1);
        }
        let topAuthor = '-';
        let topCount = 0;
        for (const [handle, c] of authorCounts) {
          if (c > topCount) {
            topAuthor = handle;
            topCount = c;
          }
        }

        row.push({ count, avgSentiment, topAuthor });
      }
      gridData.push(row);
    }

    return {
      buckets: bkts,
      bucketLabels: labels,
      grid: gridData,
      postsByNarrativeBucket: byNB,
    };
  }, [narratives, posts]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: Math.max(
            200,
            TOP_MARGIN + BOTTOM_MARGIN + narratives.length * ROW_HEIGHT + 48, // +48 for mode selector bar overlap
          ),
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [narratives.length]);

  // Max count for opacity scaling
  const maxCount = useMemo(() => {
    let m = 1;
    for (const row of grid) {
      for (const cell of row) {
        if (cell.count > m) m = cell.count;
      }
    }
    return m;
  }, [grid]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    if (narratives.length === 0 || buckets.length === 0) {
      ctx.fillStyle = '#555570';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Awaiting narrative data...', dimensions.width / 2, dimensions.height / 2);
      return;
    }

    const gridWidth = dimensions.width - LABEL_WIDTH - RIGHT_MARGIN;
    const cellWidth = gridWidth / buckets.length;

    // Draw row labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '9px JetBrains Mono, monospace';

    for (let ni = 0; ni < narratives.length; ni++) {
      const y = TOP_MARGIN + ni * ROW_HEIGHT + ROW_HEIGHT / 2;
      const isSelected = narratives[ni]!.id === selectedNarrativeId;

      // Selected row highlight
      if (isSelected) {
        ctx.fillStyle = 'rgba(255, 107, 43, 0.08)';
        ctx.fillRect(0, TOP_MARGIN + ni * ROW_HEIGHT, dimensions.width, ROW_HEIGHT);
        // Orange left accent
        ctx.fillStyle = '#FF6B2B';
        ctx.fillRect(0, TOP_MARGIN + ni * ROW_HEIGHT, 2, ROW_HEIGHT);
      }

      ctx.fillStyle = isSelected ? '#FF6B2B' : '#8888a0';
      // Short label: "N1 (52)" — narrative number + post count
      // Full summary is in the left panel
      const postCount = narratives[ni]!.postIndices?.length ?? 0;
      const shortLabel = `N${ni + 1} (${postCount})`;
      ctx.fillText(shortLabel, LABEL_WIDTH - 8, y);
    }

    // Draw cells
    for (let ni = 0; ni < narratives.length; ni++) {
      for (let bi = 0; bi < buckets.length; bi++) {
        const cell = grid[ni]?.[bi];
        if (!cell || cell.count === 0) continue;

        const x = LABEL_WIDTH + bi * cellWidth + CELL_PADDING;
        const y = TOP_MARGIN + ni * ROW_HEIGHT + CELL_PADDING;
        const w = cellWidth - CELL_PADDING * 2;
        const h = ROW_HEIGHT - CELL_PADDING * 2;

        const color = sentimentToColor(cell.avgSentiment);
        const opacity = 0.2 + 0.8 * (cell.count / maxCount);

        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);

        // Count label if big enough
        if (cell.count > 1 && w > 16) {
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#e0e0e8';
          ctx.font = '8px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(cell.count), x + w / 2, y + h / 2);
        }
        ctx.globalAlpha = 1;
      }
    }

    // Grid lines
    ctx.strokeStyle = '#2a2a45';
    ctx.lineWidth = 0.5;
    for (let ni = 0; ni <= narratives.length; ni++) {
      const y = TOP_MARGIN + ni * ROW_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(LABEL_WIDTH, y);
      ctx.lineTo(dimensions.width - RIGHT_MARGIN, y);
      ctx.stroke();
    }
    for (let bi = 0; bi <= buckets.length; bi++) {
      const x = LABEL_WIDTH + bi * cellWidth;
      ctx.beginPath();
      ctx.moveTo(x, TOP_MARGIN);
      ctx.lineTo(x, TOP_MARGIN + narratives.length * ROW_HEIGHT);
      ctx.stroke();
    }

    // Time labels
    ctx.fillStyle = '#555570';
    ctx.font = '8px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelY = TOP_MARGIN + narratives.length * ROW_HEIGHT + 6;
    for (let bi = 0; bi < bucketLabels.length; bi++) {
      // Only render every other label if too dense
      if (bucketLabels.length > 12 && bi % 2 !== 0) continue;
      const x = LABEL_WIDTH + bi * cellWidth + cellWidth / 2;
      ctx.fillText(bucketLabels[bi]!, x, labelY);
    }

    // Title
    ctx.fillStyle = '#555570';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('TEMPORAL HEATMAP', LABEL_WIDTH, 4);

    // Legend
    ctx.textAlign = 'right';
    ctx.fillText('NEG', dimensions.width - RIGHT_MARGIN, 4);
    ctx.fillStyle = sentimentToColor(-0.8);
    ctx.fillRect(dimensions.width - RIGHT_MARGIN - 50, 3, 12, 10);
    ctx.fillStyle = sentimentToColor(0);
    ctx.fillRect(dimensions.width - RIGHT_MARGIN - 36, 3, 12, 10);
    ctx.fillStyle = sentimentToColor(0.8);
    ctx.fillRect(dimensions.width - RIGHT_MARGIN - 22, 3, 12, 10);
    ctx.fillStyle = '#555570';
    ctx.textAlign = 'left';
    ctx.fillText('POS', dimensions.width - RIGHT_MARGIN - 8, 4);
  }, [narratives, grid, buckets, bucketLabels, dimensions, selectedNarrativeId, maxCount]);

  // Mouse handlers
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || narratives.length === 0 || buckets.length === 0) return;

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const gridWidth = dimensions.width - LABEL_WIDTH - RIGHT_MARGIN;
      const cellWidth = gridWidth / buckets.length;

      const bi = Math.floor((mx - LABEL_WIDTH) / cellWidth);
      const ni = Math.floor((my - TOP_MARGIN) / ROW_HEIGHT);

      if (
        bi < 0 ||
        bi >= buckets.length ||
        ni < 0 ||
        ni >= narratives.length
      ) {
        setTooltip(null);
        return;
      }

      const cell = grid[ni]?.[bi];
      if (!cell || cell.count === 0) {
        setTooltip(null);
        return;
      }

      setTooltip({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        narrativeSummary: narratives[ni]!.summary,
        timeLabel: bucketLabels[bi]!,
        postCount: cell.count,
        avgSentiment: cell.avgSentiment,
        topAuthor: cell.topAuthor,
      });
    },
    [narratives, buckets, grid, bucketLabels, dimensions],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || narratives.length === 0) return;

      const rect = canvas.getBoundingClientRect();
      const my = e.clientY - rect.top;
      const ni = Math.floor((my - TOP_MARGIN) / ROW_HEIGHT);

      if (ni >= 0 && ni < narratives.length) {
        onSelectNarrative(
          narratives[ni]!.id === selectedNarrativeId ? null : narratives[ni]!.id,
        );
      }
    },
    [narratives, selectedNarrativeId, onSelectNarrative],
  );

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[200px]">
      <canvas
        ref={canvasRef}
        style={{ width: dimensions.width, height: dimensions.height }}
        className="block cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
        onClick={handleClick}
      />
      {tooltip && (
        <div
          className="absolute z-10 pointer-events-none bg-nerv-bg-panel border border-nerv-border px-2 py-1.5 rounded-sm shadow-lg"
          style={{
            left: Math.min(tooltip.x + 12, dimensions.width - 180),
            top: tooltip.y + 12,
            maxWidth: 200,
          }}
        >
          <div className="text-[9px] font-mono text-nerv-text-muted uppercase tracking-wider">
            {tooltip.timeLabel}
          </div>
          <div className="text-[10px] font-mono text-nerv-text leading-snug mt-0.5 line-clamp-2">
            {tooltip.narrativeSummary}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] font-mono text-nerv-text-secondary tabular-nums">
              {tooltip.postCount} posts
            </span>
            <span
              className={[
                'text-[9px] font-mono tabular-nums',
                tooltip.avgSentiment > 0.1
                  ? 'text-nerv-green'
                  : tooltip.avgSentiment < -0.1
                    ? 'text-nerv-red'
                    : 'text-nerv-text-muted',
              ].join(' ')}
            >
              {tooltip.avgSentiment >= 0 ? '+' : ''}
              {tooltip.avgSentiment.toFixed(2)}
            </span>
          </div>
          <div className="text-[9px] font-mono text-nerv-text-muted mt-0.5">
            top: @{tooltip.topAuthor}
          </div>
        </div>
      )}
    </div>
  );
}
