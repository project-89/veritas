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
const COUNTRIES_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const LABEL_HEIGHT = 34;
const LABEL_SPACING = 8;
const SIDE_WIDTH = 340;
const SIDE_MARGIN = 10;
const LABEL_TOP_MARGIN = 52;
const MAX_LABELS = 14;
const LABEL_ANCHOR_ALTITUDE = 0.007;
// A label only shows while its location is on the hemisphere facing the
// viewer: it appears once the pin is well onto the near face and leaves before
// it reaches the limb. Both thresholds stay positive (front-facing only); the
// gap between them is hysteresis so a pin near the edge doesn't strobe.
const LABEL_ENTER_DOT = 0.26;
const LABEL_EXIT_DOT = 0.12;
const LABEL_OFFSCREEN_MARGIN = 40;
const LABEL_FADE_MS = 520; // fade in / fade out duration (kept in sync with CSS)
const LEADER_STUB_MIN = 16; // min horizontal run off the label / into the pin

type LabelOverlayNode = {
  wrapper: HTMLDivElement;
  inner: HTMLDivElement;
  text: HTMLDivElement;
  path: SVGPathElement;
  dot: SVGCircleElement;
};

type LabelSide = 'left' | 'right';
type ActiveLabel = {
  side: LabelSide;
  slot: number;
  phase: 'in' | 'out';
  sx: number;
  sy: number;
  color: string;
  outSince: number;
};

interface GlobePointData {
  lat: number;
  lng: number;
  color: string;
  size: number;
  eventId: string;
  title: string;
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
  const overlayNodesRef = useRef<Record<string, LabelOverlayNode>>({});
  // Sticky placement: each label owns a fixed side + vertical slot from the
  // moment it appears until it fades out, so labels never reorder or jump sides
  // while the globe turns. Slot arrays are indexed by slot; value = eventId.
  const activeLabelsRef = useRef<Map<string, ActiveLabel>>(new Map());
  const leftSlotsRef = useRef<(string | null)[]>([]);
  const rightSlotsRef = useRef<(string | null)[]>([]);
  const pointsRef = useRef<GlobePointData[]>([]);
  pointsRef.current = events.flatMap((ev) => {
    if (!Number.isFinite(ev.location?.lat) || !Number.isFinite(ev.location?.lng)) {
      return [];
    }
    // The globe only plots events whose location actually means something. Skip
    // global-scope events (e.g. crypto markets) that carry a placeholder
    // "Global" location at (20, 0) — they'd just pile up in one meaningless spot.
    if (ev.location.region === 'global' || ev.location.label === 'Global') {
      return [];
    }

    return [
      {
        lat: Math.max(-90, Math.min(90, ev.location.lat)),
        lng: ((((ev.location.lng + 180) % 360) + 360) % 360) - 180,
        color: EVENT_COLORS[ev.category] ?? '#ffffff',
        size: SEVERITY_SIZE[ev.severity] ?? 0.4,
        eventId: ev.id,
        title: ev.title,
      },
    ];
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

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.querySelector('canvas')?.remove();
      container.insertBefore(renderer.domElement, container.firstChild);

      // Globe
      const globe = new ThreeGlobe({ animateIn: true })
        .showGlobe(true)
        .showAtmosphere(true)
        .atmosphereColor('#FF6B2B')
        .atmosphereAltitude(0.18);
      const gMat = globe.globeMaterial() as InstanceType<typeof THREE.MeshPhongMaterial>;
      gMat.color.setHex(NERV_COLORS.bgDeep);
      gMat.transparent = true;
      gMat.opacity = 0.85;
      gMat.shininess = 0.4;

      try {
        const geoJson = await (await fetch(COUNTRIES_URL)).json();
        globe
          .polygonsData(geoJson.features || [])
          .polygonCapColor(() => '#12122a')
          .polygonSideColor(() => '#1a1a3a')
          .polygonStrokeColor(() => '#2a2a55')
          .polygonAltitude(0.006);
      } catch {
        /* cosmetic */
      }

      globe
        .pointsData(pointsRef.current)
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
      const dl = new THREE.DirectionalLight(0xffffff, 0.6);
      dl.position.set(200, 200, 200);
      scene.add(dl);
      const al = new THREE.PointLight(NERV_COLORS.orange, 0.3, 800);
      al.position.set(-200, 100, 200);
      scene.add(al);

      // Stars
      const sg = new THREE.BufferGeometry();
      const sp = new Float32Array(1500 * 3);
      for (let i = 0; i < 1500 * 3; i += 3) {
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        const r = 600 + Math.random() * 400;
        sp[i] = r * Math.sin(p) * Math.cos(t);
        sp[i + 1] = r * Math.sin(p) * Math.sin(t);
        sp[i + 2] = r * Math.cos(p);
      }
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      scene.add(
        new THREE.Points(
          sg,
          new THREE.PointsMaterial({ color: 0x6b6b8a, size: 0.6, transparent: true, opacity: 0.5 }),
        ),
      );

      // Controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.enablePan = false;
      controls.minDistance = 150;
      controls.maxDistance = 600;
      controls.rotateSpeed = 0.5;
      controls.zoomSpeed = 0.8;
      const markInteraction = () => {
        lastInteractionAtRef.current = performance.now();
      };
      const handleMouseDown = () => {
        mouseDown.current = true;
        markInteraction();
      };
      const handleMouseUp = () => {
        mouseDown.current = false;
        markInteraction();
      };
      renderer.domElement.addEventListener('mousedown', handleMouseDown);
      renderer.domElement.addEventListener('mouseup', handleMouseUp);
      controls.addEventListener('start', markInteraction);
      controls.addEventListener('change', markInteraction);
      controls.addEventListener('end', markInteraction);

      // --- RENDER LOOP ---
      const getOverlayNode = (eventId: string) => {
        const existing = overlayNodesRef.current[eventId];
        if (existing || !svgRef.current || !labelsRef.current) return existing;

        const wrapper = document.createElement('div');
        wrapper.dataset.eid = eventId;
        wrapper.style.position = 'absolute';
        wrapper.style.pointerEvents = 'auto';
        wrapper.style.cursor = 'pointer';
        wrapper.style.opacity = '0';
        wrapper.style.transition = `opacity ${LABEL_FADE_MS}ms ease-out`;

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
        path.setAttribute('stroke-width', '1');
        path.style.opacity = '0';
        path.style.transition = `opacity ${LABEL_FADE_MS}ms ease-out`;

        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('r', '3');
        dot.style.opacity = '0';
        dot.style.transition = `opacity ${LABEL_FADE_MS}ms ease-out`;

        wrapper.addEventListener('click', () => {
          const ev = eventsRef.current.find((e) => e.id === eventId);
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

      const slotsFor = (side: LabelSide) =>
        side === 'left' ? leftSlotsRef.current : rightSlotsRef.current;

      const firstFreeSlot = (side: LabelSide, maxSlots: number): number => {
        const slots = slotsFor(side);
        for (let i = 0; i < maxSlots; i += 1) {
          if (!slots[i]) return i;
        }
        return -1;
      };

      // Prefer the side the pin is on; fall back to the other side if full.
      const claimSlot = (
        preferred: LabelSide,
        maxSlots: number,
      ): { side: LabelSide; slot: number } | null => {
        let slot = firstFreeSlot(preferred, maxSlots);
        if (slot >= 0) return { side: preferred, slot };
        const other: LabelSide = preferred === 'left' ? 'right' : 'left';
        slot = firstFreeSlot(other, maxSlots);
        if (slot >= 0) return { side: other, slot };
        return null;
      };

      const setNodeOpacity = (eventId: string, on: boolean) => {
        const node = overlayNodesRef.current[eventId];
        if (!node) return;
        node.wrapper.style.opacity = on ? '1' : '0';
        node.path.style.opacity = on ? '0.5' : '0';
        node.dot.style.opacity = on ? '0.85' : '0';
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

        // --- SCREEN-SPACE LABELS: sticky slot, fade in / stable / fade out ---
        if (svgRef.current && labelsRef.current) {
          const now = performance.now();
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const centerX = cw / 2;
          const maxSlots = Math.max(
            1,
            Math.floor(
              (ch - LABEL_TOP_MARGIN - SIDE_MARGIN + LABEL_SPACING) /
                (LABEL_HEIGHT + LABEL_SPACING),
            ),
          );

          // 1) Project every point; collect those currently in view (front-facing
          //    + on-screen), with hysteresis so pins near the horizon don't strobe.
          const inView = new Map<
            string,
            { sx: number; sy: number; color: string; title: string; size: number }
          >();
          // Project against a freshly-inverted camera matrix so zoom (dolly) and
          // resize are reflected the same frame they happen — otherwise the pins
          // can lag the globe when the camera distance changes.
          camera.updateMatrixWorld();
          const globeCenter = new THREE.Vector3();
          globe.getWorldPosition(globeCenter);
          for (const pt of pointsRef.current) {
            const local = globe.getCoords(pt.lat, pt.lng, LABEL_ANCHOR_ALTITUDE);
            const v = new THREE.Vector3(local.x, local.y, local.z);
            globe.localToWorld(v);
            const toCamera = camera.position.clone().sub(v).normalize();
            const normal = v.clone().sub(globeCenter).normalize();
            const facingDot = toCamera.dot(normal);
            const existing = activeLabelsRef.current.get(pt.eventId);
            const wasShowing = Boolean(existing && existing.phase === 'in');
            const requiredDot = wasShowing ? LABEL_EXIT_DOT : LABEL_ENTER_DOT;
            const projected = v.clone().project(camera);
            const inDepth = projected.z >= -1 && projected.z <= 1;
            const sx = (projected.x * 0.5 + 0.5) * cw;
            const sy = (-projected.y * 0.5 + 0.5) * ch;
            const margin = wasShowing ? LABEL_OFFSCREEN_MARGIN : 0;
            const inBounds =
              sx >= -margin && sx <= cw + margin && sy >= -margin && sy <= ch + margin;
            if (facingDot > requiredDot && inDepth && inBounds) {
              inView.set(pt.eventId, {
                sx,
                sy,
                color: pt.color,
                title: pt.title,
                size: pt.size,
              });
            }
          }

          // 2) Update active labels: follow their pin, revive if the pin came
          //    back, or start fading out if the pin left the view.
          for (const [eventId, label] of activeLabelsRef.current) {
            const seen = inView.get(eventId);
            if (seen) {
              label.sx = seen.sx;
              label.sy = seen.sy;
              label.color = seen.color;
              if (label.phase === 'out') {
                label.phase = 'in';
                setNodeOpacity(eventId, true);
              }
            } else if (label.phase === 'in') {
              label.phase = 'out';
              label.outSince = now;
              setNodeOpacity(eventId, false);
            }
          }

          // 3) Retire labels that have finished fading out (frees their slot).
          for (const [eventId, label] of [...activeLabelsRef.current]) {
            if (label.phase === 'out' && now - label.outSince > LABEL_FADE_MS) {
              const slots = slotsFor(label.side);
              if (slots[label.slot] === eventId) slots[label.slot] = null;
              activeLabelsRef.current.delete(eventId);
              removeOverlayNode(eventId);
            }
          }

          // 4) Admit newly-visible events into free slots, most severe first.
          if (activeLabelsRef.current.size < MAX_LABELS) {
            const candidates = [...inView.entries()]
              .filter(([eventId]) => !activeLabelsRef.current.has(eventId))
              .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));
            for (const [eventId, seen] of candidates) {
              if (activeLabelsRef.current.size >= MAX_LABELS) break;
              const preferred: LabelSide = seen.sx < centerX ? 'left' : 'right';
              const claimed = claimSlot(preferred, maxSlots);
              if (!claimed) continue;
              slotsFor(claimed.side)[claimed.slot] = eventId;
              activeLabelsRef.current.set(eventId, {
                side: claimed.side,
                slot: claimed.slot,
                phase: 'in',
                sx: seen.sx,
                sy: seen.sy,
                color: seen.color,
                outSince: 0,
              });
              const node = getOverlayNode(eventId);
              if (node) {
                node.text.textContent = seen.title;
                // Defer the opacity flip one frame so the CSS transition runs.
                requestAnimationFrame(() => setNodeOpacity(eventId, true));
              }
            }
          }

          // 5) Position each label at its fixed slot and draw the leader curve to
          //    its pin. The label box never moves; only the curve tracks the pin.
          for (const [eventId, label] of activeLabelsRef.current) {
            const node = overlayNodesRef.current[eventId];
            if (!node) continue;
            const isLeft = label.side === 'left';
            const slotX = isLeft ? SIDE_MARGIN : cw - SIDE_WIDTH - SIDE_MARGIN;
            const slotY = LABEL_TOP_MARGIN + label.slot * (LABEL_HEIGHT + LABEL_SPACING);

            node.wrapper.style.left = `${slotX}px`;
            node.wrapper.style.top = `${slotY}px`;
            node.wrapper.style.width = `${SIDE_WIDTH}px`;
            node.wrapper.style.height = `${LABEL_HEIGHT}px`;
            node.inner.style.color = label.color;
            node.inner.style.borderLeft = isLeft ? 'none' : `2px solid ${label.color}`;
            node.inner.style.borderRight = isLeft ? `2px solid ${label.color}` : 'none';

            // 3-segment leader with angled symmetry: a horizontal stub off the
            // label, a diagonal, then a horizontal stub into the pin. Equal
            // stubs on both ends make it exactly 45° when there's room and keep
            // it symmetric otherwise.
            const labelConnectX = isLeft ? slotX + SIDE_WIDTH : slotX;
            const labelMidY = slotY + LABEL_HEIGHT / 2;
            const dirX = label.sx >= labelConnectX ? 1 : -1;
            const adx = Math.abs(label.sx - labelConnectX);
            const ady = Math.abs(label.sy - labelMidY);
            let stub = (adx - ady) / 2;
            if (stub < LEADER_STUB_MIN) stub = LEADER_STUB_MIN;
            stub = Math.min(stub, adx / 2);
            const kneeAX = labelConnectX + dirX * stub;
            const kneeBX = label.sx - dirX * stub;
            node.path.setAttribute(
              'd',
              `M${labelConnectX},${labelMidY} L${kneeAX},${labelMidY} L${kneeBX},${label.sy} L${label.sx},${label.sy}`,
            );
            node.path.setAttribute('stroke', label.color);
            node.dot.setAttribute('cx', `${label.sx}`);
            node.dot.setAttribute('cy', `${label.sy}`);
            node.dot.setAttribute('fill', label.color);
          }
        }
      };
      animate();

      // Resize
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) {
          const { width: cw, height: ch } = e.contentRect;
          if (cw && ch) {
            camera.aspect = cw / ch;
            camera.updateProjectionMatrix();
            renderer.setSize(cw, ch);
          }
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
    initGlobe().then((fn) => {
      cleanup = fn as (() => void) | undefined;
    });
    return () => {
      cancelAnimationFrame(frameRef.current);
      cleanup?.();
    };
  }, [initGlobe]);

  // Update points when events change
  useEffect(() => {
    const globe = globeRef.current as { pointsData: (d: GlobePointData[]) => void } | null;
    if (!globe || !loaded) return;
    globe.pointsData(pointsRef.current);
  }, [loaded]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-[12px] font-mono uppercase tracking-widest text-nerv-orange animate-nerv-pulse">
            INITIALIZING EVENT GLOBE...
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-[12px] font-mono uppercase tracking-widest text-nerv-red mb-2">
            GLOBE RENDER ERROR
          </div>
          <div className="text-[11px] font-mono text-nerv-text-muted">{error}</div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full">
        {/* SVG overlay for leader lines */}
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 5 }}
        />
        {/* Label container */}
        <div
          ref={labelsRef}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 6 }}
        />
      </div>
      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,107,43,0.1) 2px, rgba(255,107,43,0.1) 4px)',
        }}
      />
    </div>
  );
}
