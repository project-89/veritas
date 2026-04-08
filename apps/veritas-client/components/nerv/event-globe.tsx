'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GlobalEvent } from '../../lib/global-event.types';
import { EVENT_COLORS } from '../../lib/global-event.types';

export interface EventGlobeProps {
  events: GlobalEvent[];
  onEventClick?: (event: GlobalEvent) => void;
}

const SEVERITY_SIZE: Record<string, number> = { critical: 1.5, high: 1.0, medium: 0.7, low: 0.4 };
const NERV_COLORS = { bgDeep: 0x0a0a0f, orange: 0xff6b2b };
const COUNTRIES_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const LABEL_HEIGHT = 34;
const LABEL_SPACING = 8;
const SIDE_WIDTH = 340;
const SIDE_MARGIN = 10;
const LABEL_TOP_MARGIN = 52;
const MAX_LABELS = 14;
const LABEL_UPDATE_MS = 120;
const LABEL_ANCHOR_ALTITUDE = 0.007;
const LABEL_SIDE_HYSTERESIS = 48;
const LABEL_SIDE_SWITCH_HYSTERESIS = 96;
const LABEL_SIDE_MEMORY_UPDATES = 12;
const LABEL_VISIBLE_ENTER_DOT = 0.05;
const LABEL_VISIBLE_EXIT_DOT = -0.02;
const LABEL_OFFSCREEN_MARGIN = 24;
const LABEL_INTERACTION_SETTLE_MS = 220;
const LABEL_UPDATE_MS_MOVING = 180;

type LabelSideState = { side: 'left' | 'right'; missingUpdates: number };
type LabelVisibilityState = { visible: boolean; missingUpdates: number };
type LabelOverlayNode = {
  wrapper: HTMLDivElement;
  inner: HTMLDivElement;
  text: HTMLDivElement;
  path: SVGPathElement;
  dot: SVGCircleElement;
};

interface GlobePointData {
  lat: number; lng: number; color: string; size: number; eventId: string; title: string;
}

export function EventGlobe({ events, onEventClick }: EventGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<unknown>(null);
  const frameRef = useRef<number>(0);
  const mouseDown = useRef(false);
  const lastInteractionAtRef = useRef(0);
  const autoRotate = useRef(true);
  const targetRotationX = useRef<number | null>(null);
  const targetRotationY = useRef<number | null>(null);
  const resumeAutoRotateTimeoutRef = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for render-loop access (no React re-renders)
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const onClickRef = useRef(onEventClick);
  onClickRef.current = onEventClick;
  const displayedLabelIdsRef = useRef<string[]>([]);
  const labelSideRef = useRef<Record<string, LabelSideState | 'left' | 'right'>>({});
  const labelVisibilityRef = useRef<Record<string, LabelVisibilityState>>({});
  const overlayNodesRef = useRef<Record<string, LabelOverlayNode>>({});
  const pointsRef = useRef<GlobePointData[]>([]);
  pointsRef.current = events.flatMap(ev => {
    if (!Number.isFinite(ev.location?.lat) || !Number.isFinite(ev.location?.lng)) {
      return [];
    }

    return [{
      lat: Math.max(-90, Math.min(90, ev.location.lat)),
      lng: ((((ev.location.lng + 180) % 360) + 360) % 360) - 180,
      color: EVENT_COLORS[ev.category] ?? '#ffffff',
      size: SEVERITY_SIZE[ev.severity] ?? 0.4,
      eventId: ev.id,
      title: ev.title,
    }];
  });

  // Store Three.js objects for render loop
  const threeRef = useRef<{ camera: unknown; globe: unknown; Vector3: unknown } | null>(null);

  const initGlobe = useCallback(async (): Promise<(() => void) | undefined> => {
    if (!containerRef.current) return undefined;
    try {
      const THREE = await import('three');
      const { default: ThreeGlobe } = await import('three-globe');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');

      const container = containerRef.current;
      const w = container.clientWidth;
      const h = container.clientHeight;

      const scene = new THREE.Scene();
      scene.background = null;
      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
      camera.position.set(0, 0, 340);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.querySelector('canvas')?.remove();
      container.insertBefore(renderer.domElement, container.firstChild);

      // Globe
      const globe = new ThreeGlobe({ animateIn: true })
        .showGlobe(true).showAtmosphere(true).atmosphereColor('#FF6B2B').atmosphereAltitude(0.18);
      const gMat = globe.globeMaterial() as InstanceType<typeof THREE.MeshPhongMaterial>;
      gMat.color.setHex(NERV_COLORS.bgDeep); gMat.transparent = true; gMat.opacity = 0.85; gMat.shininess = 0.4;

      try {
        const geoJson = await (await fetch(COUNTRIES_URL)).json();
        globe.polygonsData(geoJson.features || [])
          .polygonCapColor(() => '#12122a').polygonSideColor(() => '#1a1a3a')
          .polygonStrokeColor(() => '#2a2a55').polygonAltitude(0.006);
      } catch { /* cosmetic */ }

      globe.pointsData(pointsRef.current)
        .pointLat((d: unknown) => (d as GlobePointData).lat)
        .pointLng((d: unknown) => (d as GlobePointData).lng)
        .pointAltitude(0.007)
        .pointRadius((d: unknown) => 0.4 + (d as GlobePointData).size * 0.6)
        .pointColor((d: unknown) => (d as GlobePointData).color)
        .pointResolution(8);

      scene.add(globe);
      globeRef.current = globe;
      threeRef.current = { camera, globe, Vector3: THREE.Vector3 };

      // Lights
      scene.add(new THREE.AmbientLight(0x444466, 1.2));
      const dl = new THREE.DirectionalLight(0xffffff, 0.6); dl.position.set(200, 200, 200); scene.add(dl);
      const al = new THREE.PointLight(NERV_COLORS.orange, 0.3, 800); al.position.set(-200, 100, 200); scene.add(al);

      // Stars
      const sg = new THREE.BufferGeometry(); const sp = new Float32Array(1500 * 3);
      for (let i = 0; i < 1500 * 3; i += 3) { const t = Math.random()*Math.PI*2; const p = Math.acos(2*Math.random()-1); const r = 600+Math.random()*400; sp[i]=r*Math.sin(p)*Math.cos(t); sp[i+1]=r*Math.sin(p)*Math.sin(t); sp[i+2]=r*Math.cos(p); }
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x6b6b8a, size: 0.6, transparent: true, opacity: 0.5 })));

      // Controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true; controls.dampingFactor = 0.05; controls.enablePan = false;
      controls.minDistance = 150; controls.maxDistance = 600; controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.8;
      const markInteraction = () => { lastInteractionAtRef.current = performance.now(); };
      const handleMouseDown = () => { mouseDown.current = true; markInteraction(); };
      const handleMouseUp = () => { mouseDown.current = false; markInteraction(); };
      renderer.domElement.addEventListener('mousedown', handleMouseDown);
      renderer.domElement.addEventListener('mouseup', handleMouseUp);
      controls.addEventListener('start', markInteraction);
      controls.addEventListener('change', markInteraction);
      controls.addEventListener('end', markInteraction);

      // --- RENDER LOOP ---
      let lastLabelRenderAt = 0;
      let lastLabelSignature = '';
      const getOverlayNode = (eventId: string) => {
        const existing = overlayNodesRef.current[eventId];
        if (existing || !svgRef.current || !labelsRef.current) return existing;

        const wrapper = document.createElement('div');
        wrapper.dataset.eid = eventId;
        wrapper.style.position = 'absolute';
        wrapper.style.pointerEvents = 'auto';
        wrapper.style.cursor = 'pointer';

        const inner = document.createElement('div');
        inner.style.display = 'flex';
        inner.style.alignItems = 'center';
        inner.style.width = '100%';
        inner.style.height = '100%';
        inner.style.boxSizing = 'border-box';
        inner.style.padding = '0 10px';
        inner.style.background = 'rgba(10,10,15,0.92)';

        const text = document.createElement('div');
        text.style.width = '100%';
        text.style.fontFamily = 'monospace';
        text.style.fontSize = '9.5px';
        text.style.lineHeight = '1.15';
        text.style.textAlign = 'left';
        text.style.whiteSpace = 'normal';
        text.style.overflow = 'hidden';
        text.style.overflowWrap = 'anywhere';
        text.style.wordBreak = 'break-word';
        text.style.letterSpacing = '0.02em';

        inner.appendChild(text);
        wrapper.appendChild(inner);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-width', '0.8');
        path.setAttribute('opacity', '0.45');

        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('r', '3');
        dot.setAttribute('opacity', '0.7');

        wrapper.addEventListener('click', () => {
          const ev = eventsRef.current.find(e => e.id === eventId);
          if (!ev) return;
          autoRotate.current = false;
          targetRotationX.current = ev.location.lat * (Math.PI / 180);
          targetRotationY.current = -ev.location.lng * (Math.PI / 180);
          if (resumeAutoRotateTimeoutRef.current !== null) {
            window.clearTimeout(resumeAutoRotateTimeoutRef.current);
          }
          resumeAutoRotateTimeoutRef.current = window.setTimeout(() => {
            autoRotate.current = true;
            resumeAutoRotateTimeoutRef.current = null;
          }, 10000);
          onClickRef.current?.(ev);
        });

        labelsRef.current.appendChild(wrapper);
        svgRef.current.appendChild(path);
        svgRef.current.appendChild(dot);

        const created = { wrapper, inner, text, path, dot };
        overlayNodesRef.current[eventId] = created;
        return created;
      };

      const removeOverlayNode = (eventId: string) => {
        const node = overlayNodesRef.current[eventId];
        if (!node) return;
        node.wrapper.remove();
        node.path.remove();
        node.dot.remove();
        delete overlayNodesRef.current[eventId];
      };

      const animate = () => {
        frameRef.current = requestAnimationFrame(animate);

        // Globe rotation
        if (targetRotationX.current !== null || targetRotationY.current !== null) {
          if (targetRotationX.current !== null) {
            const diffX = targetRotationX.current - globe.rotation.x;
            if (Math.abs(diffX) < 0.003) {
              globe.rotation.x = targetRotationX.current;
              targetRotationX.current = null;
            } else {
              globe.rotation.x += diffX * 0.08;
            }
          }

          if (targetRotationY.current !== null) {
          const diff = targetRotationY.current - globe.rotation.y;
          const short = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI;
            if (Math.abs(short) < 0.005) {
              globe.rotation.y = targetRotationY.current;
              targetRotationY.current = null;
            } else {
              globe.rotation.y += short * 0.08;
            }
          }
        } else if (autoRotate.current && !mouseDown.current) {
          globe.rotation.y += 0.0004;
        }

        controls.update();
        renderer.render(scene, camera);

        // --- SCREEN-SPACE LABEL UPDATE ---
        if (svgRef.current && labelsRef.current) {
          const now = performance.now();
          const interactionActive = mouseDown.current || now - lastInteractionAtRef.current < LABEL_INTERACTION_SETTLE_MS;
          const labelUpdateMs = interactionActive ? LABEL_UPDATE_MS_MOVING : LABEL_UPDATE_MS;
          if (now - lastLabelRenderAt < labelUpdateMs) return;
          lastLabelRenderAt = now;

          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const svg = svgRef.current;
          const labelContainer = labelsRef.current;

          // Project each point to screen space + front-facing check
          type ScreenLabel = { sx: number; sy: number; color: string; title: string; eventId: string; size: number };
          const screenLabels: ScreenLabel[] = [];

          for (const pt of pointsRef.current) {
            const local = globe.getCoords(pt.lat, pt.lng, LABEL_ANCHOR_ALTITUDE);
            const v = new THREE.Vector3(local.x, local.y, local.z);
            // Transform to world space through globe's matrix
            globe.localToWorld(v);

            // Front-facing check
            const toCamera = camera.position.clone().sub(v).normalize();
            const globeCenter = new THREE.Vector3();
            globe.getWorldPosition(globeCenter);
            const normal = v.clone().sub(globeCenter).normalize();
            const facingDot = toCamera.dot(normal);
            const previousVisibility = labelVisibilityRef.current[pt.eventId];
            const wasVisible = previousVisibility?.visible ?? false;
            const requiredDot = wasVisible ? LABEL_VISIBLE_EXIT_DOT : LABEL_VISIBLE_ENTER_DOT;

            // Project to screen
            const projected = v.clone().project(camera);
            const projectedInDepth = projected.z >= -1 && projected.z <= 1;

            const sx = Math.round(((projected.x * 0.5 + 0.5) * cw) / 2) * 2;
            const sy = Math.round(((-projected.y * 0.5 + 0.5) * ch) / 2) * 2;
            const withinBounds = wasVisible
              ? sx >= -LABEL_OFFSCREEN_MARGIN && sx <= cw + LABEL_OFFSCREEN_MARGIN && sy >= -LABEL_OFFSCREEN_MARGIN && sy <= ch + LABEL_OFFSCREEN_MARGIN
              : sx >= 0 && sx <= cw && sy >= 0 && sy <= ch;
            const isVisible = facingDot > requiredDot && projectedInDepth && withinBounds;

            if (!isVisible) {
              labelVisibilityRef.current[pt.eventId] = {
                visible: false,
                missingUpdates: (previousVisibility?.missingUpdates ?? 0) + 1,
              };
              continue;
            }

            labelVisibilityRef.current[pt.eventId] = { visible: true, missingUpdates: 0 };

            screenLabels.push({ sx, sy, color: pt.color, title: pt.title, eventId: pt.eventId, size: pt.size });
          }

          for (const [eventId, visibility] of Object.entries(labelVisibilityRef.current)) {
            if (!screenLabels.some(label => label.eventId === eventId) && visibility.missingUpdates > LABEL_SIDE_MEMORY_UPDATES) {
              delete labelVisibilityRef.current[eventId];
            }
          }

          const rankedLabels = screenLabels
            .sort((a, b) => (b.size - a.size) || a.eventId.localeCompare(b.eventId));
          const visibleById = new Map(rankedLabels.map(label => [label.eventId, label]));

          let nextLabels: ScreenLabel[];
          if (interactionActive) {
            const frozenLabels = displayedLabelIdsRef.current
              .map(eventId => visibleById.get(eventId))
              .filter((label): label is ScreenLabel => Boolean(label));
            nextLabels = frozenLabels.length > 0 ? frozenLabels : rankedLabels.slice(0, MAX_LABELS);
          } else {
            const persistentLabels = displayedLabelIdsRef.current
              .map(eventId => visibleById.get(eventId))
              .filter((label): label is ScreenLabel => Boolean(label));
            nextLabels = [...persistentLabels];

            for (const label of rankedLabels) {
              if (nextLabels.length >= MAX_LABELS) break;
              if (visibleById.has(label.eventId) && !nextLabels.some(existing => existing.eventId === label.eventId)) {
                nextLabels.push(label);
              }
            }

            displayedLabelIdsRef.current = nextLabels.map(label => label.eventId);
          }

          if (interactionActive && displayedLabelIdsRef.current.length === 0) {
            displayedLabelIdsRef.current = nextLabels.map(label => label.eventId);
          }

          const centerX = cw / 2;
          const maxLabelsPerSide = Math.max(
            1,
            Math.floor((ch - LABEL_TOP_MARGIN - SIDE_MARGIN + LABEL_SPACING) / (LABEL_HEIGHT + LABEL_SPACING)),
          );
          const assignedSideById = new Map<string, 'left' | 'right'>();

          for (const label of nextLabels) {
            const previousState = labelSideRef.current[label.eventId];
            const previousSide = typeof previousState === 'string' ? previousState : previousState?.side;
            const side = interactionActive && previousSide
              ? previousSide
              : previousSide
              ? previousSide === 'left'
                ? label.sx > centerX + LABEL_SIDE_SWITCH_HYSTERESIS
                  ? 'right'
                  : 'left'
                : label.sx < centerX - LABEL_SIDE_SWITCH_HYSTERESIS
                  ? 'left'
                  : 'right'
              : label.sx <= centerX - LABEL_SIDE_HYSTERESIS
                ? 'left'
                : label.sx >= centerX + LABEL_SIDE_HYSTERESIS
                  ? 'right'
                  : label.sx < centerX
                    ? 'left'
                    : 'right';

            assignedSideById.set(label.eventId, side);
            labelSideRef.current[label.eventId] = { side, missingUpdates: 0 };
          }

          if (!interactionActive) {
            for (const [eventId, state] of Object.entries(labelSideRef.current)) {
              if (!assignedSideById.has(eventId)) {
                if (typeof state === 'string') {
                  delete labelSideRef.current[eventId];
                  continue;
                }

                state.missingUpdates += 1;
                if (state.missingUpdates > LABEL_SIDE_MEMORY_UPDATES) {
                  delete labelSideRef.current[eventId];
                }
              }
            }
          }

          // Split into left and right based on screen X
          const leftLabels = nextLabels
            .filter(l => assignedSideById.get(l.eventId) === 'left')
            .sort((a, b) => a.sy - b.sy)
            .slice(0, maxLabelsPerSide);
          const rightLabels = nextLabels
            .filter(l => assignedSideById.get(l.eventId) === 'right')
            .sort((a, b) => a.sy - b.sy)
            .slice(0, maxLabelsPerSide);

          // Stack labels vertically on each side (no overlap)
          const stackLabels = (labels: ScreenLabel[], startX: number) => {
            let nextY = LABEL_TOP_MARGIN;
            return labels.map((l, index) => {
              const labelY = nextY;
              nextY = labelY + LABEL_HEIGHT + LABEL_SPACING;
              return { ...l, labelX: startX, labelY, routeIndex: index };
            });
          };

          const leftStacked = stackLabels(leftLabels, SIDE_MARGIN);
          const rightStacked = stackLabels(rightLabels, cw - SIDE_WIDTH - SIDE_MARGIN);

          const allStacked = [...leftStacked, ...rightStacked];
          const overlaySignature = allStacked.map(l => {
            const isLeft = l.labelX < cw / 2;
            return `${l.eventId}:${l.sx},${l.sy},${l.labelX},${l.labelY},${isLeft ? 'L' : 'R'}:${l.title}`;
          }).join('|');
          if (overlaySignature === lastLabelSignature) return;
          lastLabelSignature = overlaySignature;
          const activeNodeIds = new Set(allStacked.map(l => l.eventId));

          for (const l of allStacked) {
            const isLeft = l.labelX < cw / 2;
            const labelConnectX = isLeft ? l.labelX + SIDE_WIDTH : l.labelX;
            const labelMidY = l.labelY + LABEL_HEIGHT / 2;
            const towardLabel = labelConnectX >= l.sx ? 1 : -1;
            const diagonalSpread = 56 + Math.min(72, l.routeIndex * 12);
            const diagonalStartRaw = labelConnectX - towardLabel * diagonalSpread;
            const diagonalStartMin = Math.min(l.sx, labelConnectX) + 12;
            const diagonalStartMax = Math.max(l.sx, labelConnectX) - 24;
            const diagonalStartX = Math.max(diagonalStartMin, Math.min(diagonalStartMax, diagonalStartRaw));
            const horizontalEntryX = labelConnectX - towardLabel * 18;
            const node = getOverlayNode(l.eventId);
            if (!node) continue;

            node.wrapper.style.display = 'block';
            node.wrapper.style.left = `${l.labelX}px`;
            node.wrapper.style.top = `${l.labelY}px`;
            node.wrapper.style.width = `${SIDE_WIDTH}px`;
            node.wrapper.style.height = `${LABEL_HEIGHT}px`;

            node.inner.style.color = l.color;
            node.inner.style.borderLeft = isLeft ? 'none' : `2px solid ${l.color}`;
            node.inner.style.borderRight = isLeft ? `2px solid ${l.color}` : 'none';
            if (node.text.textContent !== l.title) {
              node.text.textContent = l.title;
            }

            node.path.setAttribute(
              'd',
              `M${l.sx},${l.sy} L${diagonalStartX},${l.sy} L${horizontalEntryX},${labelMidY} L${labelConnectX},${labelMidY}`,
            );
            node.path.setAttribute('stroke', l.color);
            node.dot.setAttribute('cx', `${l.sx}`);
            node.dot.setAttribute('cy', `${l.sy}`);
            node.dot.setAttribute('fill', l.color);
          }

          for (const eventId of Object.keys(overlayNodesRef.current)) {
            if (!activeNodeIds.has(eventId)) {
              removeOverlayNode(eventId);
            }
          }
        }
      };
      animate();

      // Resize
      const ro = new ResizeObserver(entries => {
        for (const e of entries) {
          const { width: cw, height: ch } = e.contentRect;
          if (cw && ch) { camera.aspect = cw / ch; camera.updateProjectionMatrix(); renderer.setSize(cw, ch); }
        }
      });
      ro.observe(container);
      setLoaded(true);

      return () => {
        ro.disconnect();
        cancelAnimationFrame(frameRef.current);
        if (resumeAutoRotateTimeoutRef.current !== null) {
          window.clearTimeout(resumeAutoRotateTimeoutRef.current);
          resumeAutoRotateTimeoutRef.current = null;
        }
        controls.removeEventListener('start', markInteraction);
        controls.removeEventListener('change', markInteraction);
        controls.removeEventListener('end', markInteraction);
        renderer.domElement.removeEventListener('mousedown', handleMouseDown);
        renderer.domElement.removeEventListener('mouseup', handleMouseUp);
        renderer.dispose();
        controls.dispose();
        sg.dispose();
        for (const eventId of Object.keys(overlayNodesRef.current)) {
          removeOverlayNode(eventId);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize globe');
      return undefined;
    }
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initGlobe().then(fn => { cleanup = fn as (() => void) | undefined; });
    return () => { cancelAnimationFrame(frameRef.current); cleanup?.(); };
  }, [initGlobe]);

  // Update points when events change
  useEffect(() => {
    const globe = globeRef.current as { pointsData: (d: GlobePointData[]) => void } | null;
    if (!globe || !loaded) return;
    globe.pointsData(pointsRef.current);
  }, [events, loaded]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-orange animate-nerv-pulse">
            INITIALIZING EVENT GLOBE...
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-red mb-2">GLOBE RENDER ERROR</div>
          <div className="text-[9px] font-mono text-nerv-text-muted">{error}</div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full">
        {/* SVG overlay for leader lines */}
        <svg ref={svgRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5 }} />
        {/* Label container */}
        <div ref={labelsRef} className="absolute inset-0 pointer-events-none" style={{ zIndex: 6 }} />
      </div>
      {/* Scanline overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,107,43,0.1) 2px, rgba(255,107,43,0.1) 4px)',
      }} />
    </div>
  );
}
