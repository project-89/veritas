'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GlobalEvent } from '../../lib/global-event.types';
import { EVENT_COLORS } from '../../lib/global-event.types';

export interface EventGlobeProps {
  events: GlobalEvent[];
  onEventClick?: (event: GlobalEvent) => void;
}

const SEVERITY_SIZE: Record<string, number> = {
  critical: 1.5,
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

const NERV_COLORS = { bgDeep: 0x0a0a0f, orange: 0xff6b2b };

const COUNTRIES_GEOJSON_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

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
  const globeRef = useRef<unknown>(null);
  const frameRef = useRef<number>(0);
  const mouseDown = useRef(false);
  const autoRotate = useRef(true);
  const targetRotationY = useRef<number | null>(null);
  const labelGroupsRef = useRef<unknown[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const onClickRef = useRef(onEventClick);
  onClickRef.current = onEventClick;

  const pointsRef = useRef<GlobePointData[]>([]);
  pointsRef.current = events.map(ev => ({
    lat: ev.location.lat,
    lng: ev.location.lng,
    color: EVENT_COLORS[ev.category] ?? '#ffffff',
    size: SEVERITY_SIZE[ev.severity] ?? 0.4,
    eventId: ev.id,
    title: ev.title.slice(0, 45),
  }));

  const initGlobe = useCallback(async (): Promise<(() => void) | undefined> => {
    if (!containerRef.current) return undefined;

    try {
      const THREE = await import('three');
      const { default: ThreeGlobe } = await import('three-globe');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      const { CSS2DRenderer, CSS2DObject } = await import('three/examples/jsm/renderers/CSS2DRenderer.js');

      const container = containerRef.current;
      const w = container.clientWidth;
      const h = container.clientHeight;

      // Scene + camera
      const scene = new THREE.Scene();
      scene.background = null;
      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
      camera.position.set(0, 0, 340);

      // WebGL renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      // CSS2D renderer for labels (overlays on top of WebGL)
      const labelRenderer = new CSS2DRenderer();
      labelRenderer.setSize(w, h);
      labelRenderer.domElement.style.position = 'absolute';
      labelRenderer.domElement.style.top = '0';
      labelRenderer.domElement.style.left = '0';
      labelRenderer.domElement.style.pointerEvents = 'none';
      container.appendChild(labelRenderer.domElement);

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

      // Country polygons
      try {
        const geoRes = await fetch(COUNTRIES_GEOJSON_URL);
        const geoJson = await geoRes.json();
        globe.polygonsData(geoJson.features || [])
          .polygonCapColor(() => '#12122a')
          .polygonSideColor(() => '#1a1a3a')
          .polygonStrokeColor(() => '#2a2a55')
          .polygonAltitude(0.006);
      } catch { /* cosmetic */ }

      // Colored dots on the globe (all events)
      globe.pointsData(pointsRef.current)
        .pointLat((d: unknown) => (d as GlobePointData).lat)
        .pointLng((d: unknown) => (d as GlobePointData).lng)
        .pointAltitude(0.007)
        .pointRadius((d: unknown) => 0.4 + (d as GlobePointData).size * 0.6)
        .pointColor((d: unknown) => (d as GlobePointData).color)
        .pointResolution(8);

      scene.add(globe);
      globeRef.current = globe;

      // --- LEADER LINE LABELS (CSS2D) ---
      // Convert lat/lng to 3D position on the globe surface
      const GLOBE_RADIUS = 100;
      const latLngTo3D = (lat: number, lng: number, altitude: number) => {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lng + 180) * (Math.PI / 180);
        const r = GLOBE_RADIUS * (1 + altitude);
        return new THREE.Vector3(
          -(r * Math.sin(phi) * Math.cos(theta)),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.sin(theta),
        );
      };

      const buildLabels = (pts: GlobePointData[]) => {
        // Remove old label groups
        for (const grp of labelGroupsRef.current) {
          globe.remove(grp as InstanceType<typeof THREE.Object3D>);
        }
        labelGroupsRef.current = [];

        // Top events by severity
        const top = [...pts].sort((a, b) => b.size - a.size).slice(0, 12);

        for (const pt of top) {
          const group = new THREE.Group();
          const surfacePos = latLngTo3D(pt.lat, pt.lng, 0.01);
          group.position.copy(surfacePos);

          // Leader line: from surface up to label anchor
          const normal = surfacePos.clone().normalize();
          const lineEnd = normal.clone().multiplyScalar(35); // extend 35 units outward
          const lineGeom = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            lineEnd,
          ]);
          const lineMat = new THREE.LineBasicMaterial({
            color: new THREE.Color(pt.color),
            transparent: true,
            opacity: 0.5,
          });
          group.add(new THREE.Line(lineGeom, lineMat));

          // Small sphere at the base
          const dotGeom = new THREE.SphereGeometry(0.6, 8, 8);
          const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pt.color) });
          group.add(new THREE.Mesh(dotGeom, dotMat));

          // CSS2D label at the end of the leader line
          const labelDiv = document.createElement('div');
          labelDiv.style.cssText = `
            font-family: monospace;
            font-size: 11px;
            line-height: 1.3;
            padding: 3px 8px;
            color: ${pt.color};
            background: rgba(10, 10, 15, 0.92);
            border-left: 2px solid ${pt.color};
            white-space: nowrap;
            pointer-events: auto;
            cursor: pointer;
            letter-spacing: 0.03em;
          `;
          labelDiv.textContent = pt.title;
          labelDiv.addEventListener('click', () => {
            const ev = eventsRef.current.find(e => e.id === pt.eventId);
            if (!ev) return;
            autoRotate.current = false;
            targetRotationY.current = -ev.location.lng * (Math.PI / 180);
            setTimeout(() => { autoRotate.current = true; }, 10000);
            onClickRef.current?.(ev);
          });

          const cssLabel = new CSS2DObject(labelDiv);
          cssLabel.position.copy(lineEnd);
          group.add(cssLabel);

          globe.add(group);
          labelGroupsRef.current.push(group);
        }
      };

      buildLabels(pointsRef.current);

      // Store buildLabels for updates
      (globe as unknown as Record<string, unknown>)['_buildLabels'] = buildLabels;

      // Lights
      scene.add(new THREE.AmbientLight(0x444466, 1.2));
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
      dirLight.position.set(200, 200, 200);
      scene.add(dirLight);
      const accentLight = new THREE.PointLight(NERV_COLORS.orange, 0.3, 800);
      accentLight.position.set(-200, 100, 200);
      scene.add(accentLight);

      // Stars
      const starGeom = new THREE.BufferGeometry();
      const starPos = new Float32Array(1500 * 3);
      for (let i = 0; i < 1500 * 3; i += 3) {
        const t = Math.random() * Math.PI * 2;
        const p = Math.acos(2 * Math.random() - 1);
        const r = 600 + Math.random() * 400;
        starPos[i] = r * Math.sin(p) * Math.cos(t);
        starPos[i + 1] = r * Math.sin(p) * Math.sin(t);
        starPos[i + 2] = r * Math.cos(p);
      }
      starGeom.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({ color: 0x6b6b8a, size: 0.6, transparent: true, opacity: 0.5 });
      scene.add(new THREE.Points(starGeom, starMat));

      // Controls
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

      // Animation loop
      let pulsePhase = 0;
      const animate = () => {
        frameRef.current = requestAnimationFrame(animate);
        pulsePhase += 0.03;

        // Rotate to target or auto-rotate
        if (targetRotationY.current !== null) {
          const diff = targetRotationY.current - globe.rotation.y;
          const short = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI;
          if (Math.abs(short) < 0.005) {
            globe.rotation.y = targetRotationY.current;
            targetRotationY.current = null;
          } else {
            globe.rotation.y += short * 0.05;
          }
        } else if (autoRotate.current && !mouseDown.current) {
          globe.rotation.y += 0.0004;
        }

        // Pulse critical dots
        globe.pointAltitude((d: unknown) => {
          const p = d as GlobePointData;
          return p.size >= 1.5 ? 0.007 + 0.006 * Math.sin(pulsePhase) : 0.007;
        });

        controls.update();
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);
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
            labelRenderer.setSize(cw, ch);
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
        starGeom.dispose();
        starMat.dispose();
        container.innerHTML = '';
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize globe');
      return undefined;
    }
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    initGlobe().then((fn) => { cleanup = fn as (() => void) | undefined; });
    return () => { cancelAnimationFrame(frameRef.current); cleanup?.(); };
  }, [initGlobe]);

  // Update when events change
  useEffect(() => {
    const globe = globeRef.current as Record<string, unknown> | null;
    if (!globe || !loaded) return;
    (globe as { pointsData: (d: GlobePointData[]) => void }).pointsData(pointsRef.current);
    const buildLabels = globe['_buildLabels'] as ((pts: GlobePointData[]) => void) | undefined;
    buildLabels?.(pointsRef.current);
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
          <div className="text-center max-w-sm">
            <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-red mb-2">GLOBE RENDER ERROR</div>
            <div className="text-[9px] font-mono text-nerv-text-muted">{error}</div>
          </div>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,107,43,0.1) 2px, rgba(255,107,43,0.1) 4px)',
      }} />
    </div>
  );
}
