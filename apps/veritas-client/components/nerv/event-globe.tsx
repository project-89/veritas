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
const GLOBE_RADIUS = 100;
const LABEL_HEIGHT = 28;
const LABEL_SPACING = 4;
const SIDE_WIDTH = 260;
const SIDE_MARGIN = 10;
const MAX_LABELS = 14;

interface GlobePointData {
  lat: number; lng: number; color: string; size: number; eventId: string; title: string;
}

// Lat/lng to 3D position in globe local space
function latLngToXYZ(lat: number, lng: number, alt: number) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const r = GLOBE_RADIUS * (1 + alt);
  return { x: -(r * Math.sin(phi) * Math.cos(theta)), y: r * Math.cos(phi), z: r * Math.sin(phi) * Math.sin(theta) };
}

export function EventGlobe({ events, onEventClick }: EventGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<unknown>(null);
  const frameRef = useRef<number>(0);
  const mouseDown = useRef(false);
  const autoRotate = useRef(true);
  const targetRotationY = useRef<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for render-loop access (no React re-renders)
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const onClickRef = useRef(onEventClick);
  onClickRef.current = onEventClick;
  const pointsRef = useRef<GlobePointData[]>([]);
  pointsRef.current = events.map(ev => ({
    lat: ev.location.lat, lng: ev.location.lng,
    color: EVENT_COLORS[ev.category] ?? '#ffffff',
    size: SEVERITY_SIZE[ev.severity] ?? 0.4,
    eventId: ev.id, title: ev.title.slice(0, 42),
  }));

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
      renderer.domElement.addEventListener('mousedown', () => { mouseDown.current = true; });
      renderer.domElement.addEventListener('mouseup', () => { mouseDown.current = false; });

      // --- RENDER LOOP ---
      let pulsePhase = 0;
      const animate = () => {
        frameRef.current = requestAnimationFrame(animate);
        pulsePhase += 0.03;

        // Globe rotation
        if (targetRotationY.current !== null) {
          const diff = targetRotationY.current - globe.rotation.y;
          const short = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI;
          if (Math.abs(short) < 0.005) { globe.rotation.y = targetRotationY.current; targetRotationY.current = null; }
          else { globe.rotation.y += short * 0.05; }
        } else if (autoRotate.current && !mouseDown.current) {
          globe.rotation.y += 0.0004;
        }

        // Pulse
        globe.pointAltitude((d: unknown) => {
          const p = d as GlobePointData;
          return p.size >= 1.5 ? 0.007 + 0.006 * Math.sin(pulsePhase) : 0.007;
        });

        controls.update();
        renderer.render(scene, camera);

        // --- SCREEN-SPACE LABEL UPDATE (every 3rd frame) ---
        if (pulsePhase % 0.09 < 0.031 && svgRef.current && labelsRef.current) {
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const svg = svgRef.current;
          const labelContainer = labelsRef.current;

          // Sort by severity for priority
          const sorted = [...pointsRef.current].sort((a, b) => b.size - a.size).slice(0, MAX_LABELS);

          // Project each point to screen space + front-facing check
          type ScreenLabel = { sx: number; sy: number; color: string; title: string; eventId: string; visible: boolean };
          const screenLabels: ScreenLabel[] = [];

          for (const pt of sorted) {
            const local = latLngToXYZ(pt.lat, pt.lng, 0.01);
            const v = new THREE.Vector3(local.x, local.y, local.z);
            // Transform to world space through globe's matrix
            globe.localToWorld(v);

            // Front-facing check
            const toCamera = camera.position.clone().sub(v).normalize();
            const globeCenter = new THREE.Vector3();
            globe.getWorldPosition(globeCenter);
            const normal = v.clone().sub(globeCenter).normalize();
            const isFront = toCamera.dot(normal) > 0.05;

            if (!isFront) continue;

            // Project to screen
            const projected = v.clone().project(camera);
            const sx = (projected.x * 0.5 + 0.5) * cw;
            const sy = (-projected.y * 0.5 + 0.5) * ch;

            if (sx < 0 || sx > cw || sy < 0 || sy > ch) continue;

            screenLabels.push({ sx, sy, color: pt.color, title: pt.title, eventId: pt.eventId, visible: true });
          }

          // Split into left and right based on screen X
          const leftLabels = screenLabels.filter(l => l.sx < cw / 2).sort((a, b) => a.sy - b.sy);
          const rightLabels = screenLabels.filter(l => l.sx >= cw / 2).sort((a, b) => a.sy - b.sy);

          // Stack labels vertically on each side (no overlap)
          const stackLabels = (labels: ScreenLabel[], startX: number) => {
            let nextY = SIDE_MARGIN;
            return labels.map(l => {
              const labelY = Math.max(nextY, l.sy - LABEL_HEIGHT / 2);
              nextY = labelY + LABEL_HEIGHT + LABEL_SPACING;
              return { ...l, labelX: startX, labelY };
            });
          };

          const leftStacked = stackLabels(leftLabels, SIDE_MARGIN);
          const rightStacked = stackLabels(rightLabels, cw - SIDE_WIDTH - SIDE_MARGIN);

          const allStacked = [...leftStacked, ...rightStacked];

          // Build SVG leader lines
          let svgPaths = '';
          for (const l of allStacked) {
            const isLeft = l.labelX < cw / 2;
            const labelEdgeX = isLeft ? l.labelX + SIDE_WIDTH : l.labelX;
            const labelMidY = l.labelY + LABEL_HEIGHT / 2;
            // L-shape: point → horizontal offset → label edge
            const elbowX = isLeft ? Math.max(l.sx - 30, labelEdgeX + 10) : Math.min(l.sx + 30, labelEdgeX - 10);
            svgPaths += `<path d="M${l.sx},${l.sy} L${elbowX},${labelMidY} L${labelEdgeX},${labelMidY}" fill="none" stroke="${l.color}" stroke-width="0.8" opacity="0.45"/>`;
            svgPaths += `<circle cx="${l.sx}" cy="${l.sy}" r="3" fill="${l.color}" opacity="0.7"/>`;
          }
          svg.innerHTML = svgPaths;

          // Build label DOM
          let html = '';
          for (const l of allStacked) {
            const isLeft = l.labelX < cw / 2;
            const border = isLeft ? `border-right:2px solid ${l.color}` : `border-left:2px solid ${l.color}`;
            const textAlign = isLeft ? 'text-align:right' : 'text-align:left';
            html += `<div data-eid="${l.eventId}" style="position:absolute;left:${l.labelX}px;top:${l.labelY}px;width:${SIDE_WIDTH}px;height:${LABEL_HEIGHT}px;display:flex;align-items:center;pointer-events:auto;cursor:pointer;">`;
            html += `<span style="font-family:monospace;font-size:10px;line-height:1.2;padding:2px 8px;color:${l.color};background:rgba(10,10,15,0.92);${border};${textAlign};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;letter-spacing:0.02em;">${l.title}</span>`;
            html += '</div>';
          }
          labelContainer.innerHTML = html;

          // Click handlers
          for (const el of labelContainer.querySelectorAll('[data-eid]')) {
            el.addEventListener('click', () => {
              const eid = el.getAttribute('data-eid');
              const ev = eventsRef.current.find(e => e.id === eid);
              if (!ev) return;
              autoRotate.current = false;
              targetRotationY.current = -ev.location.lng * (Math.PI / 180);
              setTimeout(() => { autoRotate.current = true; }, 10000);
              onClickRef.current?.(ev);
            });
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

      return () => { ro.disconnect(); cancelAnimationFrame(frameRef.current); renderer.dispose(); controls.dispose(); sg.dispose(); };
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
