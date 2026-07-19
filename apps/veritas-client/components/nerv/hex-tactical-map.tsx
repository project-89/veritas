'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  EVENT_COLORS,
  type EventCategory,
  type EventSeverity,
  type GlobalEvent,
} from '../../lib/global-event.types';

// Same low-res country geometry the globe uses; rasterized once into the hex
// grid via point-in-polygon so continents read as an amber hex-mesh silhouette.
const COUNTRIES_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

const COLS = 60;
const ROWS = 30;
const ROW_DEG = 180 / ROWS;
const COL_DEG = 360 / COLS;

const R = 9;
const HEX_W = Math.sqrt(3) * R;
const ROW_STEP = 1.5 * R;
const PAD = R * 2;

// NERV amber palette — monochrome, glowing.
const AMBER = '#ff7a1a';
const AMBER_HOT = '#ffb454';
const AMBER_DIM = '#5a2f12';

const SEV_RANK: Record<EventSeverity, number> = { critical: 3, high: 2, medium: 1, low: 0 };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function hexPoints(cx: number, cy: number, scale = 1): string {
  let s = '';
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    s += `${(cx + R * scale * Math.cos(a)).toFixed(1)},${(cy + R * scale * Math.sin(a)).toFixed(1)} `;
  }
  return s.trim();
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
  properties?: { NAME?: string; ISO_A3?: string };
}

/** Antarctica renders as a huge smeared tile band on an equirectangular grid
 *  and hosts no events — leave it off the tactical picture. */
function isAntarctica(f: Feature): boolean {
  return f.properties?.ISO_A3 === 'ATA' || f.properties?.NAME === 'Antarctica';
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
  topSeverity: number;
  count: number;
}

export interface HexContestedZone {
  id: string;
  lat: number;
  lng: number;
  title: string;
  perspectiveCount: number;
}

export interface HexSurgeZone {
  lat: number;
  lng: number;
  recent24h: number;
  baselinePerDay: number;
  factor: number;
}

export interface HexTacticalMapProps {
  events: GlobalEvent[];
  /** Multi-perspective stories — zones where framings of one event diverge. */
  contested?: HexContestedZone[];
  /** Zones anomalously active vs their own baseline. */
  surge?: HexSurgeZone[];
  onSelectEvent?: (event: GlobalEvent) => void;
  /** Click-through from a contested marker to its story on /perspectives. */
  onSelectContested?: (storyId: string) => void;
}

// Contested-narrative marker: pale blue-white so it reads as a distinct layer
// over both the amber terrain and the category-colored hotspots.
const CONTESTED = '#c9d8ff';

export function HexTacticalMap({
  events,
  contested,
  surge,
  onSelectEvent,
  onSelectContested,
}: HexTacticalMapProps) {
  const [landSet, setLandSet] = useState<Set<string> | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const geo = await (await fetch(COUNTRIES_URL)).json();
        const features: Feature[] = ((geo.features ?? []) as Feature[]).filter(
          (f) => !isAntarctica(f),
        );
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
      // Feed-home fallback locations mark where the OUTLET lives, not the
      // story — a zone must not light up because a wire service is based there.
      if (ev.source.startsWith('RSS:') && ev.location.region !== 'geocoded') continue;
      const row = clamp(Math.floor((90 - lat) / ROW_DEG), 0, ROWS - 1);
      const col = clamp(Math.floor((lng + 180) / COL_DEG), 0, COLS - 1);
      const key = `${row},${col}`;
      const arr = m.get(key);
      if (arr) arr.push(ev);
      else m.set(key, [ev]);
    }
    return m;
  }, [events]);

  const { cells, hot, maxCount, vbW, vbH } = useMemo(() => {
    const arr: HexCell[] = [];
    const hotCells: HexCell[] = [];
    let max = 1;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const key = `${r},${c}`;
        const evs = bins.get(key) ?? [];
        const land = landSet?.has(key) ?? false;
        if (!land && evs.length === 0) continue; // dark ocean unless something's there
        const { cx, cy } = cellPx(r, c);
        let dominant: EventCategory | null = null;
        let topSev = 0;
        if (evs.length > 0) {
          const counts = new Map<EventCategory, number>();
          for (const e of evs) {
            counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
            topSev = Math.max(topSev, SEV_RANK[e.severity] ?? 0);
          }
          dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
          max = Math.max(max, evs.length);
        }
        const cell: HexCell = {
          key,
          cx,
          cy,
          land,
          events: evs,
          dominant,
          topSeverity: topSev,
          count: evs.length,
        };
        arr.push(cell);
        if (evs.length > 0) hotCells.push(cell);
      }
    }
    return {
      cells: arr,
      hot: hotCells,
      maxCount: max,
      vbW: PAD * 2 + COLS * HEX_W + HEX_W / 2,
      vbH: PAD * 2 + ROWS * ROW_STEP,
    };
  }, [bins, landSet]);

  const selected = cells.find((c) => c.key === selectedKey && c.count > 0) ?? null;

  // The radar sweep marks a genuine epicenter: the worst cell holding a
  // high/critical event. With no severe events it stays hidden — otherwise the
  // count tiebreaker would just point at source-density bias (US-heavy EONET/
  // NWS/RSS coverage), which is attention theater, not signal.
  const epicenter = useMemo(() => {
    return hot
      .filter((c) => c.topSeverity >= 2)
      .sort((a, b) => b.topSeverity - a.topSeverity || b.count - a.count)[0] ?? null;
  }, [hot]);
  const epiEvent = epicenter?.events
    .slice()
    .sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0))[0];

  // Top few events get on-map zone labels. Greedy collision skip: a label
  // whose text row would overlap an already-placed one is dropped in favor of
  // the next-ranked cell — overlapping text ("HARNEY, OREGONLAKE, MINNESOTA")
  // is worse than a missing label.
  const labelled = useMemo(() => {
    const ranked = [...hot].sort((a, b) => b.topSeverity - a.topSeverity || b.count - a.count);
    const placed: HexCell[] = [];
    for (const cell of ranked) {
      if (placed.length >= 5) break;
      const collides = placed.some(
        (p) => Math.abs(p.cy - cell.cy) < 16 && Math.abs(p.cx - cell.cx) < 220,
      );
      if (!collides) placed.push(cell);
    }
    return placed;
  }, [hot]);

  // Count EVENTS at high/critical (the banner says "events" — zones would
  // undercount a cell holding several severe events).
  const severeEventCount = useMemo(
    () =>
      hot.reduce(
        (n, cell) => n + cell.events.filter((e) => (SEV_RANK[e.severity] ?? 0) >= 2).length,
        0,
      ),
    [hot],
  );

  const legendCategories = useMemo(() => {
    const present = new Set<EventCategory>();
    for (const cell of hot) {
      if (cell.dominant) present.add(cell.dominant);
    }
    return [...present];
  }, [hot]);

  // Contested-narrative zones, binned to hex cells (one marker per cell).
  const contestedCells = useMemo(() => {
    const byCell = new Map<
      string,
      { cx: number; cy: number; titles: string[]; storyId: string; maxPerspectives: number }
    >();
    for (const zone of contested ?? []) {
      if (!Number.isFinite(zone.lat) || !Number.isFinite(zone.lng)) continue;
      const row = clamp(Math.floor((90 - zone.lat) / ROW_DEG), 0, ROWS - 1);
      const col = clamp(Math.floor((zone.lng + 180) / COL_DEG), 0, COLS - 1);
      const key = `${row},${col}`;
      const existing = byCell.get(key);
      if (existing) {
        existing.titles.push(zone.title);
        if (zone.perspectiveCount > existing.maxPerspectives) {
          // The most-contested story owns the cell's click-through.
          existing.maxPerspectives = zone.perspectiveCount;
          existing.storyId = zone.id;
        }
      } else {
        byCell.set(key, {
          ...cellPx(row, col),
          titles: [zone.title],
          storyId: zone.id,
          maxPerspectives: zone.perspectiveCount,
        });
      }
    }
    return [...byCell.values()];
  }, [contested]);

  // Surge zones binned to cells (server bins on the same 6° grid).
  const surgeCells = useMemo(() => {
    const out: Array<{ cx: number; cy: number; factor: number; recent24h: number }> = [];
    for (const zone of surge ?? []) {
      if (!Number.isFinite(zone.lat) || !Number.isFinite(zone.lng)) continue;
      const row = clamp(Math.floor((90 - zone.lat) / ROW_DEG), 0, ROWS - 1);
      const col = clamp(Math.floor((zone.lng + 180) / COL_DEG), 0, COLS - 1);
      out.push({ ...cellPx(row, col), factor: zone.factor, recent24h: zone.recent24h });
    }
    return out;
  }, [surge]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-sm border border-nerv-orange/30 bg-[#0a0603]">
      {/* corner brackets — screen bezel */}
      {['left-1 top-1 border-l border-t', 'right-1 top-1 border-r border-t', 'left-1 bottom-1 border-l border-b', 'right-1 bottom-1 border-r border-b'].map(
        (pos) => (
          <div key={pos} className={`pointer-events-none absolute ${pos} h-4 w-4 border-nerv-orange/50`} />
        ),
      )}

      {!landSet && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <span className="text-[11px] font-mono uppercase tracking-widest text-nerv-orange/70 animate-nerv-pulse">
            Initializing tactical grid…
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${vbW.toFixed(0)} ${vbH.toFixed(0)}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Tactical hex world map"
      >
        <defs>
          <filter id="amberGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* continents as an amber hex-mesh */}
        {cells.map((cell) => {
          if (cell.count > 0) return null; // hotspots drawn separately, on top
          return (
            <polygon
              key={cell.key}
              points={hexPoints(cell.cx, cell.cy, 0.92)}
              fill={AMBER}
              fillOpacity={0.08}
              stroke={AMBER}
              strokeOpacity={0.3}
              strokeWidth={0.5}
            />
          );
        })}

        {/* radar sweep on the epicenter */}
        {epicenter && (
          <g transform={`translate(${epicenter.cx} ${epicenter.cy})`} opacity={0.8}>
            {[R * 1.6, R * 3, R * 4.6].map((rad) => (
              <circle key={rad} r={rad} fill="none" stroke={AMBER} strokeOpacity={0.35} strokeWidth={0.5} />
            ))}
            <g>
              <path
                d={`M0,0 L0,${(-R * 4.6).toFixed(1)} A${R * 4.6},${R * 4.6} 0 0 1 ${(R * 4.6 * Math.sin(0.5)).toFixed(1)},${(-R * 4.6 * Math.cos(0.5)).toFixed(1)} Z`}
                fill={AMBER}
                fillOpacity={0.16}
              />
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 0 0"
                to="360 0 0"
                dur="4s"
                repeatCount="indefinite"
              />
            </g>
          </g>
        )}

        {/* event hotspots — colored by dominant category (same palette as the globe) */}
        {hot.map((cell) => {
          const t = cell.count / maxCount;
          const isSel = cell.key === selectedKey;
          const color = cell.dominant ? EVENT_COLORS[cell.dominant] : AMBER_HOT;
          return (
            <g
              key={cell.key}
              className="cursor-pointer"
              onClick={() => setSelectedKey(isSel ? null : cell.key)}
            >
              <polygon
                points={hexPoints(cell.cx, cell.cy, 0.92)}
                fill={color}
                fillOpacity={0.4 + 0.4 * t}
                stroke={color}
                strokeWidth={isSel ? 1.6 : 0.8}
                filter="url(#amberGlow)"
              >
                <title>
                  {cell.count} event{cell.count === 1 ? '' : 's'} · {cell.dominant}
                </title>
              </polygon>
              <circle cx={cell.cx} cy={cell.cy} r={1.6 + 2.2 * t} fill="#fff6e8" />
            </g>
          );
        })}

        {/* surge pulses: this zone is beating its OWN baseline, not just dense */}
        {surgeCells.map((c) => (
          <g key={`surge-${c.cx}-${c.cy}`} pointerEvents="none">
            <circle cx={c.cx} cy={c.cy} r={R * 1.5} fill="none" stroke={AMBER_HOT} strokeWidth={0.8}>
              <animate
                attributeName="r"
                values={`${R * 1.2};${R * 2.6}`}
                dur="1.8s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="stroke-opacity"
                values="0.8;0"
                dur="1.8s"
                repeatCount="indefinite"
              />
            </circle>
            <circle cx={c.cx} cy={c.cy} r={R * 1.2} fill="none" stroke={AMBER_HOT} strokeOpacity={0.5} strokeWidth={0.6}>
              <title>
                Surge: {c.recent24h} events in 24h — {c.factor}× this zone's baseline
              </title>
            </circle>
          </g>
        ))}

        {/* contested-narrative markers: rotated-square outline over the zone,
            intensity scaled by how many perspective classes are fighting */}
        {contestedCells.map((c) => {
          const intense = c.maxPerspectives >= 3;
          return (
            <g
              key={`contested-${c.cx}-${c.cy}`}
              opacity={intense ? 1 : 0.75}
              className={onSelectContested ? 'cursor-pointer' : undefined}
              onClick={onSelectContested ? () => onSelectContested(c.storyId) : undefined}
            >
              <rect
                x={-R * 0.95}
                y={-R * 0.95}
                width={R * 1.9}
                height={R * 1.9}
                transform={`translate(${c.cx} ${c.cy}) rotate(45)`}
                fill={CONTESTED}
                fillOpacity={0.06}
                stroke={CONTESTED}
                strokeWidth={intense ? 1.2 : 0.8}
              >
                <title>
                  Contested narrative ({c.maxPerspectives} perspectives): {c.titles[0]}
                  {c.titles.length > 1 ? ` (+${c.titles.length - 1} more)` : ''} — click to compare
                </title>
              </rect>
              {intense && (
                <rect
                  x={-R * 1.25}
                  y={-R * 1.25}
                  width={R * 2.5}
                  height={R * 2.5}
                  transform={`translate(${c.cx} ${c.cy}) rotate(45)`}
                  fill="none"
                  stroke={CONTESTED}
                  strokeOpacity={0.35}
                  strokeWidth={0.5}
                />
              )}
            </g>
          );
        })}

        {/* zone labels for the top events */}
        {labelled.map((cell) => {
          const ev = cell.events[0];
          if (!ev) return null;
          // Labels extend TOWARD the map center so edge cells never clip.
          const left = cell.cx > vbW / 2;
          return (
            <g key={`lbl-${cell.key}`} pointerEvents="none">
              <line
                x1={cell.cx}
                y1={cell.cy}
                x2={cell.cx + (left ? -R * 2 : R * 2)}
                y2={cell.cy - R * 1.4}
                stroke={AMBER}
                strokeOpacity={0.5}
                strokeWidth={0.5}
              />
              <text
                x={cell.cx + (left ? -R * 2.3 : R * 2.3)}
                y={cell.cy - R * 1.6}
                textAnchor={left ? 'end' : 'start'}
                fontSize={6.5}
                fontFamily="monospace"
                fill={AMBER_HOT}
                style={{ letterSpacing: '0.05em' }}
              >
                {ev.location.label.slice(0, 22).toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>

      {/* scanlines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,122,26,0.6) 2px, rgba(255,122,26,0.6) 3px)',
        }}
      />

      {/* HUD: warning banner (data-driven) */}
      <div className="pointer-events-none absolute left-3 top-3 z-10">
        {severeEventCount > 0 ? (
          <div className="border border-nerv-orange/60 bg-nerv-orange/10 px-2 py-1">
            <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-nerv-orange">
              ⚠ {severeEventCount} high-severity event{severeEventCount === 1 ? '' : 's'} detected
            </div>
          </div>
        ) : (
          <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-nerv-orange/70">
            ◇ Monitoring — {hot.length} active zone{hot.length === 1 ? '' : 's'}
          </div>
        )}
        {legendCategories.length > 0 && (
          <div className="mt-1.5 flex items-center gap-2.5">
            {legendCategories.map((cat) => (
              <span key={cat} className="flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: EVENT_COLORS[cat] }}
                />
                <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-orange/60">
                  {cat}
                </span>
              </span>
            ))}
            {contestedCells.length > 0 && (
              <span className="flex items-center gap-1">
                <span
                  className="h-1.5 w-1.5 rotate-45 border"
                  style={{ borderColor: CONTESTED }}
                />
                <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-orange/60">
                  contested narrative
                </span>
              </span>
            )}
            {surgeCells.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full border border-nerv-amber animate-nerv-pulse" />
                <span className="text-[9px] font-mono uppercase tracking-wider text-nerv-orange/60">
                  surge
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* HUD: epicenter readout */}
      {epiEvent && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 font-mono text-[10px] uppercase tracking-wider text-nerv-orange/80">
          <div>
            Epicenter: {epiEvent.location.lat.toFixed(1)}
            {epiEvent.location.lat >= 0 ? 'N' : 'S'} {Math.abs(epiEvent.location.lng).toFixed(1)}
            {epiEvent.location.lng >= 0 ? 'E' : 'W'}
          </div>
          <div className="text-nerv-orange/60">{epiEvent.title.slice(0, 46)}</div>
        </div>
      )}

      {/* HUD: status strip */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-10 text-right font-mono text-[10px] uppercase tracking-wider text-nerv-orange/70">
        <div>Signals: {hot.reduce((n, c) => n + c.count, 0)}</div>
        <div>Zones: {hot.length}</div>
        <div className="text-nerv-orange">Status: Live</div>
      </div>

      {selected && (
        <div className="absolute right-3 top-10 z-20 w-72 rounded-sm border border-nerv-orange/40 bg-[#120a05]/95 backdrop-blur-sm">
          <div className="flex items-center justify-between border-b border-nerv-orange/30 px-3 py-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-nerv-orange/80">
              {selected.count} event{selected.count === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              className="text-[12px] font-mono text-nerv-orange/60 hover:text-nerv-orange"
            >
              ✕
            </button>
          </div>
          <ul className="max-h-[46vh] divide-y divide-nerv-orange/15 overflow-y-auto">
            {selected.events.slice(0, 20).map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelectEvent?.(e)}
                  className="block w-full px-3 py-2 text-left transition-colors hover:bg-nerv-orange/10"
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-mono text-nerv-orange/60">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: EVENT_COLORS[e.category] }}
                    />
                    <span className="truncate">{e.location.label}</span>
                    {(e.severity === 'high' || e.severity === 'critical') && (
                      <span className="shrink-0 uppercase text-[9px] tracking-wider text-nerv-red">
                        {e.severity}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12px] font-mono text-[#ffe9cf] leading-snug line-clamp-2">
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
