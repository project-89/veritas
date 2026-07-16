'use client';

import { useEffect, useMemo, useState } from 'react';
import { EVENT_COLORS, type EventCategory, type GlobalEvent } from '../../lib/global-event.types';

// Same low-res country geometry the globe uses; rasterized once into the hex
// grid via point-in-polygon so continents read without tracing coastlines.
const COUNTRIES_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

const COLS = 42;
const ROWS = 21;
const ROW_DEG = 180 / ROWS;
const COL_DEG = 360 / COLS;

// Pointy-top hex packing. Cells are drawn as extruded 3D chips: a top face
// raised by `height` px above a base outline, with the front walls filled in
// darker. Hot zones raise higher, so they read as glowing columns.
const R = 13;
const HEX_W = Math.sqrt(3) * R;
const ROW_STEP = 1.5 * R;
const PAD = R * 2;
const BASE_H = 4; // resting chip thickness for ocean/land
const HOT_H = 26; // extra rise for the hottest cell

const OCEAN_FACE = '#0e4a78';
const OCEAN_WALL = '#07263f';
const LAND_FACE = '#0c343b';
const LAND_WALL = '#061c20';
const LAND_STROKE = '#3ad2e6';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function hexVerts(cx: number, cy: number): Array<[number, number]> {
  const v: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    v.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return v;
}
const ptsStr = (v: Array<[number, number]>) => v.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

// The visible front walls: lower silhouette of the top face down to the base.
function frontWall(top: Array<[number, number]>, base: Array<[number, number]>): string {
  const chain = [5, 4, 3, 2, 1]; // upper-left → bottom → upper-right
  const pts: Array<[number, number]> = [];
  for (const i of chain) pts.push(top[i] as [number, number]);
  for (const i of [...chain].reverse()) pts.push(base[i] as [number, number]);
  return ptsStr(pts);
}

function darken(hex: string, f: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = Number.parseInt(full, 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

function cellPx(row: number, col: number): { cx: number; cy: number } {
  return {
    cx: PAD + HEX_W / 2 + (col + (row % 2 ? 0.5 : 0)) * HEX_W,
    cy: PAD + R + row * ROW_STEP,
  };
}
function cellGeo(row: number, col: number): { lat: number; lng: number } {
  return { lat: 90 - (row + 0.5) * ROW_DEG, lng: -180 + (col + 0.5) * COL_DEG };
}

type Ring = number[][];
function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]?.[0] ?? 0;
    const yi = ring[i]?.[1] ?? 0;
    const xj = ring[j]?.[0] ?? 0;
    const yj = ring[j]?.[1] ?? 0;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
interface Feature {
  geometry?: { type?: string; coordinates?: unknown };
}
function isLand(lng: number, lat: number, features: Feature[]): boolean {
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') {
      const rings = g.coordinates as Ring[];
      if (rings[0] && pointInRing(lng, lat, rings[0])) return true;
    } else if (g.type === 'MultiPolygon') {
      const polys = g.coordinates as Ring[][];
      for (const poly of polys) if (poly[0] && pointInRing(lng, lat, poly[0])) return true;
    }
  }
  return false;
}

interface HexCell {
  key: string;
  cx: number;
  cy: number;
  land: boolean;
  events: GlobalEvent[];
  dominant: EventCategory | null;
  count: number;
}

export interface HexTacticalMapProps {
  events: GlobalEvent[];
  onSelectEvent?: (event: GlobalEvent) => void;
}

export function HexTacticalMap({ events, onSelectEvent }: HexTacticalMapProps) {
  const [landSet, setLandSet] = useState<Set<string> | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const geo = await (await fetch(COUNTRIES_URL)).json();
        const features: Feature[] = geo.features ?? [];
        const set = new Set<string>();
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const { lat, lng } = cellGeo(r, c);
            if (isLand(lng, lat, features)) set.add(`${r},${c}`);
          }
        }
        if (!cancelled) setLandSet(set);
      } catch {
        if (!cancelled) setLandSet(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bins = useMemo(() => {
    const m = new Map<string, GlobalEvent[]>();
    for (const ev of events) {
      const lat = ev.location?.lat;
      const lng = ev.location?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (ev.location.region === 'global' || ev.location.label === 'Global') continue;
      const row = clamp(Math.floor((90 - lat) / ROW_DEG), 0, ROWS - 1);
      const col = clamp(Math.floor((lng + 180) / COL_DEG), 0, COLS - 1);
      const key = `${row},${col}`;
      const arr = m.get(key);
      if (arr) arr.push(ev);
      else m.set(key, [ev]);
    }
    return m;
  }, [events]);

  const { cells, maxCount, vbW, vbH } = useMemo(() => {
    const arr: HexCell[] = [];
    let max = 1;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const key = `${r},${c}`;
        const evs = bins.get(key) ?? [];
        const { cx, cy } = cellPx(r, c);
        let dominant: EventCategory | null = null;
        if (evs.length > 0) {
          const counts = new Map<EventCategory, number>();
          for (const e of evs) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
          dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
          max = Math.max(max, evs.length);
        }
        arr.push({
          key,
          cx,
          cy,
          land: landSet?.has(key) ?? false,
          events: evs,
          dominant,
          count: evs.length,
        });
      }
    }
    return {
      cells: arr,
      maxCount: max,
      vbW: PAD * 2 + COLS * HEX_W + HEX_W / 2,
      vbH: PAD * 2 + ROWS * ROW_STEP + HOT_H,
    };
  }, [bins, landSet]);

  const selected = cells.find((c) => c.key === selectedKey && c.count > 0) ?? null;
  const totalHot = cells.reduce((n, c) => n + (c.count > 0 ? 1 : 0), 0);

  return (
    <div className="relative h-full w-full overflow-hidden rounded border border-nerv-border bg-nerv-bg-deep">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background: 'radial-gradient(ellipse at 50% 42%, rgba(58,210,230,0.10), transparent 72%)',
        }}
      />
      {!landSet && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <span className="text-[11px] font-mono uppercase tracking-widest text-nerv-text-muted animate-nerv-pulse">
            Initializing tactical grid…
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${vbW.toFixed(0)} ${vbH.toFixed(0)}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="3D hex tactical world map"
      >
        <defs>
          <filter id="hexGlow" x="-70%" y="-70%" width="240%" height="240%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Rows drawn top→bottom so nearer (lower) chips overlap farther walls. */}
        {cells.map((cell) => {
          const hot = cell.count > 0;
          const height = BASE_H + (hot ? HOT_H * (cell.count / maxCount) : 0);
          const face = hot && cell.dominant ? (EVENT_COLORS[cell.dominant] ?? OCEAN_FACE) : cell.land ? LAND_FACE : OCEAN_FACE;
          const wall = hot && cell.dominant ? darken(EVENT_COLORS[cell.dominant] ?? '#0e4a78', 0.4) : cell.land ? LAND_WALL : OCEAN_WALL;
          const base = hexVerts(cell.cx, cell.cy);
          const top = hexVerts(cell.cx, cell.cy - height);
          const isSel = cell.key === selectedKey;
          return (
            <g
              key={cell.key}
              className={hot ? 'cursor-pointer' : ''}
              onClick={hot ? () => setSelectedKey(isSel ? null : cell.key) : undefined}
            >
              {/* front wall */}
              <polygon points={frontWall(top, base)} fill={wall} stroke={wall} strokeWidth={0.4} />
              {/* top face */}
              <polygon
                points={ptsStr(top)}
                fill={face}
                fillOpacity={hot ? 0.92 : cell.land ? 0.5 : 0.38}
                stroke={hot ? face : cell.land ? LAND_STROKE : '#2f7fb0'}
                strokeOpacity={hot ? 1 : cell.land ? 0.4 : 0.28}
                strokeWidth={isSel ? 1.8 : 0.7}
                filter={hot ? 'url(#hexGlow)' : undefined}
              >
                {hot && (
                  <title>
                    {cell.count} event{cell.count === 1 ? '' : 's'} · {cell.dominant}
                  </title>
                )}
              </polygon>
            </g>
          );
        })}
      </svg>

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(58,210,230,0.5) 2px, rgba(58,210,230,0.5) 3px)',
        }}
      />

      <div className="pointer-events-none absolute left-3 top-3 z-10">
        <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
          Tactical Grid
        </div>
        <div className="text-[12px] font-mono tabular-nums text-nerv-orange">
          {totalHot} hot zone{totalHot === 1 ? '' : 's'}
        </div>
      </div>

      {selected && (
        <div className="absolute right-3 top-3 z-20 w-72 rounded border border-nerv-border bg-nerv-bg-panel/95 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-nerv-border px-3 py-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-nerv-text-muted">
              {selected.count} event{selected.count === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              className="text-[12px] font-mono text-nerv-text-muted hover:text-nerv-orange"
            >
              ✕
            </button>
          </div>
          <ul className="max-h-[46vh] divide-y divide-nerv-border/60 overflow-y-auto">
            {selected.events.slice(0, 20).map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelectEvent?.(e)}
                  className="block w-full px-3 py-2 text-left transition-colors hover:bg-nerv-bg-elevated/50"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: EVENT_COLORS[e.category] ?? OCEAN_FACE }}
                    />
                    <span className="truncate text-[11px] font-mono text-nerv-text-muted">
                      {e.location.label}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[12px] font-mono text-nerv-text leading-snug line-clamp-2">
                    {e.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
