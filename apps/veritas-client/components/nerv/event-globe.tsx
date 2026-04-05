'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GlobalEvent } from '../../lib/global-event.types';
import { EVENT_COLORS } from '../../lib/global-event.types';

export interface EventGlobeProps {
  events: GlobalEvent[];
  onEventClick?: (event: GlobalEvent) => void;
}

// Map severity to point size
const SEVERITY_SIZE: Record<string, number> = {
  critical: 1.5,
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

const NERV_COLORS = {
  bgDeep: 0x0a0a0f,
  orange: 0xff6b2b,
};

const COUNTRIES_GEOJSON_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

interface GlobePointData {
  lat: number;
  lng: number;
  color: string;
  size: number;
  eventId: string;
}

export function EventGlobe({ events, onEventClick }: EventGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<unknown>(null);
  const rendererRef = useRef<unknown>(null);
  const cameraRef = useRef<unknown>(null);
  const labelSvgRef = useRef<SVGSVGElement>(null);
  const labelDivRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const mouseDown = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep latest events in ref for click handler
  const eventsRef = useRef(events);
  eventsRef.current = events;

  // Convert events to globe point data
  const pointsRef = useRef<GlobePointData[]>([]);
  pointsRef.current = events.map(ev => ({
    lat: ev.location.lat,
    lng: ev.location.lng,
    color: EVENT_COLORS[ev.category] ?? '#ffffff',
    size: SEVERITY_SIZE[ev.severity] ?? 0.4,
    eventId: ev.id,
  }));

  const initGlobe = useCallback(async (): Promise<(() => void) | undefined> => {
    if (!containerRef.current) return undefined;

    try {
      const THREE = await import('three');
      const { default: ThreeGlobe } = await import('three-globe');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');

      const container = containerRef.current;
      const w = container.clientWidth;
      const h = container.clientHeight;

      // Scene
      const scene = new THREE.Scene();
      scene.background = null;

      // Camera
      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
      camera.position.set(0, 0, 340);

      // Renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.innerHTML = '';
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Globe
      const globe = new ThreeGlobe({ animateIn: true })
        .showGlobe(true)
        .showAtmosphere(true)
        .atmosphereColor('#FF6B2B')
        .atmosphereAltitude(0.18);

      const globeMaterial = globe.globeMaterial() as InstanceType<typeof THREE.MeshPhongMaterial>;
      globeMaterial.color.setHex(NERV_COLORS.bgDeep);
      globeMaterial.transparent = true;
      globeMaterial.opacity = 0.85;
      globeMaterial.shininess = 0.4;

      // Country polygons
      try {
        const geoRes = await fetch(COUNTRIES_GEOJSON_URL);
        const geoJson = await geoRes.json();
        const countries = geoJson.features || [];
        globe
          .polygonsData(countries)
          .polygonCapColor(() => '#12122a')
          .polygonSideColor(() => '#1a1a3a')
          .polygonStrokeColor(() => '#2a2a55')
          .polygonAltitude(0.006);
      } catch {
        // Cosmetic — continue without
      }

      // Points — altitude must be above country polygons (0.006)
      globe
        .pointsData(pointsRef.current)
        .pointLat((d: unknown) => (d as GlobePointData).lat)
        .pointLng((d: unknown) => (d as GlobePointData).lng)
        .pointAltitude((d: unknown) => 0.02 + (d as GlobePointData).size * 0.04)
        .pointRadius((d: unknown) => 0.3 + (d as GlobePointData).size * 0.5)
        .pointColor((d: unknown) => (d as GlobePointData).color)
        .pointResolution(8);

      // Labels handled via custom HTML overlay (see animation loop below)

      scene.add(globe);
      globeRef.current = globe;

      // Lights
      const ambientLight = new THREE.AmbientLight(0x444466, 1.2);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
      dirLight.position.set(200, 200, 200);
      scene.add(dirLight);

      const accentLight = new THREE.PointLight(NERV_COLORS.orange, 0.3, 800);
      accentLight.position.set(-200, 100, 200);
      scene.add(accentLight);

      // Stars
      const starGeometry = new THREE.BufferGeometry();
      const starCount = 1500;
      const starPositions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount * 3; i += 3) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 600 + Math.random() * 400;
        starPositions[i] = r * Math.sin(phi) * Math.cos(theta);
        starPositions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
        starPositions[i + 2] = r * Math.cos(phi);
      }
      starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
      const starMaterial = new THREE.PointsMaterial({
        color: 0x6b6b8a,
        size: 0.6,
        transparent: true,
        opacity: 0.5,
      });
      const stars = new THREE.Points(starGeometry, starMaterial);
      scene.add(stars);

      // Orbit controls
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.enablePan = false;
      controls.minDistance = 150;
      controls.maxDistance = 600;
      controls.rotateSpeed = 0.5;
      controls.zoomSpeed = 0.8;

      renderer.domElement.addEventListener('mousedown', () => { mouseDown.current = true; });
      renderer.domElement.addEventListener('mouseup', () => { mouseDown.current = false; });
      renderer.domElement.addEventListener('touchstart', () => { mouseDown.current = true; });
      renderer.domElement.addEventListener('touchend', () => { mouseDown.current = false; });

      // Click detection
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      renderer.domElement.addEventListener('click', (e: MouseEvent) => {
        if (!onEventClick) return;
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const intersects = raycaster.intersectObjects(globe.children, true);
        if (intersects.length > 0) {
          const hitPoint = intersects[0]!.point;
          let closestEvent: GlobalEvent | null = null;
          let closestDist = Infinity;

          for (const ev of eventsRef.current) {
            const phi2 = (90 - ev.location.lat) * (Math.PI / 180);
            const theta2 = (ev.location.lng + 180) * (Math.PI / 180);
            const r = 100;
            const x = -(r * Math.sin(phi2) * Math.cos(theta2));
            const y = r * Math.cos(phi2);
            const z = r * Math.sin(phi2) * Math.sin(theta2);
            const dist = hitPoint.distanceTo(new THREE.Vector3(x, y, z));
            if (dist < closestDist && dist < 20) {
              closestDist = dist;
              closestEvent = ev;
            }
          }
          if (closestEvent) onEventClick(closestEvent);
        }
      });

      cameraRef.current = camera;

      // Lat/lng to 3D world position (matching three-globe's coordinate system)
      const latLngToVector = (lat: number, lng: number, alt: number) => {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lng + 180) * (Math.PI / 180);
        const r = 100 * (1 + alt);
        return new THREE.Vector3(
          -(r * Math.sin(phi) * Math.cos(theta)),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.sin(theta),
        );
      };

      // Project 3D to screen with visibility check
      const projectToScreen = (worldPos: InstanceType<typeof THREE.Vector3>, globeRotY: number) => {
        // Apply globe rotation
        const rotated = worldPos.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), globeRotY);
        // Check if point faces camera (dot product with camera direction)
        const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const toPoint = rotated.clone().normalize();
        const facing = toPoint.dot(cameraDir);
        // Point is visible if facing camera (dot < -0.1 means front-facing)
        if (facing > -0.05) return null;

        const projected = rotated.clone().project(camera);
        const hw = container.clientWidth / 2;
        const hh = container.clientHeight / 2;
        return { x: projected.x * hw + hw, y: -(projected.y * hh) + hh };
      };

      // Animation
      let pulsePhase = 0;
      let labelFrame = 0;
      const animate = () => {
        frameRef.current = requestAnimationFrame(animate);
        pulsePhase += 0.03;
        labelFrame++;

        if (!mouseDown.current) {
          globe.rotation.y += 0.0004;
        }

        // Pulse critical points
        globe.pointAltitude((d: unknown) => {
          const p = d as GlobePointData;
          if (p.size >= 1.5) {
            return 0.02 + p.size * 0.04 + 0.03 * Math.sin(pulsePhase);
          }
          return 0.02 + p.size * 0.04;
        });

        controls.update();
        renderer.render(scene, camera);

        // Project labels every 5th frame via direct DOM (no React re-render)
        if (labelFrame % 5 === 0 && labelSvgRef.current && labelDivRef.current) {
          const svg = labelSvgRef.current;
          const div = labelDivRef.current;
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          const MARGIN = 12;
          const LABEL_H = 16;
          const MAX_LABELS = 12;
          const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

          // Collect visible points
          const visible: Array<{ pt: GlobePointData; sx: number; sy: number; ev: GlobalEvent }> = [];
          for (const pt of pointsRef.current) {
            const worldPos = latLngToVector(pt.lat, pt.lng, 0.03);
            const screen = projectToScreen(worldPos, globe.rotation.y);
            if (!screen) continue;
            if (screen.x < 0 || screen.x > cw || screen.y < 0 || screen.y > ch) continue;
            const ev = eventsRef.current.find(e => e.id === pt.eventId);
            if (!ev) continue;
            visible.push({ pt, sx: screen.x, sy: screen.y, ev });
          }

          // Sort by severity, limit
          visible.sort((a, b) => (sev[a.ev.severity] ?? 3) - (sev[b.ev.severity] ?? 3));
          const labels = visible.slice(0, MAX_LABELS);

          // Assign label Y slots on left and right sides (no overlaps)
          const leftSlots: number[] = [];
          const rightSlots: number[] = [];

          type LabelInfo = { sx: number; sy: number; labelY: number; textX: number; isLeft: boolean; title: string; color: string; id: string };
          const resolved: LabelInfo[] = [];

          for (const l of labels) {
            const isLeft = l.sx < cw / 2;
            const slots = isLeft ? leftSlots : rightSlots;
            const textX = isLeft ? MARGIN : cw - MARGIN;

            // Find free Y slot
            let labelY = Math.max(MARGIN, Math.min(ch - MARGIN, l.sy));
            let attempts = 0;
            while (attempts < 30) {
              const conflict = slots.some(s => Math.abs(s - labelY) < LABEL_H);
              if (!conflict) break;
              labelY += LABEL_H;
              if (labelY > ch - MARGIN) labelY = MARGIN + attempts * LABEL_H;
              attempts++;
            }
            slots.push(labelY);

            resolved.push({ sx: l.sx, sy: l.sy, labelY, textX, isLeft, title: l.ev.title.slice(0, 40), color: l.pt.color, id: l.ev.id });
          }

          // Build SVG stems (polyline: point → elbow → text)
          let svgHtml = '';
          for (const r of resolved) {
            const elbowX = r.isLeft ? MARGIN + 140 : cw - MARGIN - 140;
            svgHtml += `<polyline points="${r.sx},${r.sy} ${elbowX},${r.labelY} ${r.textX},${r.labelY}" fill="none" stroke="${r.color}" stroke-width="0.7" opacity="0.5"/>`;
            svgHtml += `<circle cx="${r.sx}" cy="${r.sy}" r="2.5" fill="${r.color}" opacity="0.8"/>`;
          }
          svg.innerHTML = svgHtml;

          // Build text labels
          let divHtml = '';
          for (const r of resolved) {
            const align = r.isLeft ? 'left:8px;text-align:left;' : 'right:8px;text-align:right;';
            const border = r.isLeft ? `border-left:2px solid ${r.color};` : `border-right:2px solid ${r.color};`;
            divHtml += `<div data-eid="${r.id}" style="position:absolute;top:${r.labelY - 7}px;${align}z-index:6;cursor:pointer;transition:opacity 0.2s;">`;
            divHtml += `<span style="font-family:monospace;font-size:8px;line-height:1;padding:2px 4px;color:${r.color};background:rgba(10,10,15,0.9);${border}white-space:nowrap;">${r.title}</span>`;
            divHtml += '</div>';
          }
          div.innerHTML = divHtml;

          // Attach click handlers
          for (const el of div.querySelectorAll('[data-eid]')) {
            el.addEventListener('click', () => {
              const eid = el.getAttribute('data-eid');
              const ev = eventsRef.current.find(e => e.id === eid);
              if (ev) onEventClick?.(ev);
            });
          }
        }
      };
      animate();

      // Resize
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width: cw, height: ch } = entry.contentRect;
          if (cw && ch) {
            camera.aspect = cw / ch;
            camera.updateProjectionMatrix();
            renderer.setSize(cw, ch);
          }
        }
      });
      resizeObserver.observe(container);

      setLoaded(true);

      return () => {
        resizeObserver.disconnect();
        cancelAnimationFrame(frameRef.current);
        renderer.dispose();
        controls.dispose();
        starGeometry.dispose();
        starMaterial.dispose();
        container.innerHTML = '';
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize globe');
      return undefined;
    }
  }, [onEventClick]);

  // Init globe on mount
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initGlobe().then((fn) => { cleanup = fn as (() => void) | undefined; });
    return () => {
      cancelAnimationFrame(frameRef.current);
      cleanup?.();
    };
  }, [initGlobe]);

  // Update points when events change
  useEffect(() => {
    const globe = globeRef.current as {
      pointsData: (d: GlobePointData[]) => void;
    } | null;
    if (!globe || !loaded) return;
    globe.pointsData(pointsRef.current);
  }, [events, loaded]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      {/* Loading */}
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-orange animate-nerv-pulse">
              INITIALIZING EVENT GLOBE...
            </div>
            <div className="mt-2 w-32 h-px bg-nerv-border mx-auto overflow-hidden">
              <div className="h-full bg-nerv-orange animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center max-w-sm">
            <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-red mb-2">
              GLOBE RENDER ERROR
            </div>
            <div className="text-[9px] font-mono text-nerv-text-muted">{error}</div>
          </div>
        </div>
      )}

      {/* Globe container */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Label overlay — direct DOM manipulation via refs (no React re-renders) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 5 }}>
        <svg ref={labelSvgRef} className="absolute inset-0 w-full h-full" />
        <div ref={labelDivRef} className="absolute inset-0 pointer-events-auto" />
      </div>

      {/* Scan-line overlay */}
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
