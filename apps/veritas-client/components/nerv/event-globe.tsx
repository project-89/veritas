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

      // Points
      globe
        .pointsData(pointsRef.current)
        .pointLat((d: unknown) => (d as GlobePointData).lat)
        .pointLng((d: unknown) => (d as GlobePointData).lng)
        .pointAltitude((d: unknown) => 0.01 + (d as GlobePointData).size * 0.03)
        .pointRadius((d: unknown) => 0.2 + (d as GlobePointData).size * 0.4)
        .pointColor((d: unknown) => (d as GlobePointData).color)
        .pointResolution(6);

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

      // Animation
      let pulsePhase = 0;
      const animate = () => {
        frameRef.current = requestAnimationFrame(animate);
        pulsePhase += 0.03;

        if (!mouseDown.current) {
          globe.rotation.y += 0.0004;
        }

        // Pulse critical points
        globe.pointAltitude((d: unknown) => {
          const p = d as GlobePointData;
          if (p.size >= 1.5) {
            return 0.01 + p.size * 0.03 + 0.02 * Math.sin(pulsePhase);
          }
          return 0.01 + p.size * 0.03;
        });

        controls.update();
        renderer.render(scene, camera);
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
