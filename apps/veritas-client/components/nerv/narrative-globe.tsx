'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GlobeArc, GlobePoint } from '../../lib/globe-data';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NarrativeGlobeProps {
  points: GlobePoint[];
  arcs: GlobeArc[];
  width?: number;
  height?: number;
  onPointClick?: (point: GlobePoint) => void;
}

// ---------------------------------------------------------------------------
// NERV color constants
// ---------------------------------------------------------------------------

const NERV_COLORS = {
  bgDeep: 0x0a0a0f,
  bgPanel: 0x1a1a2e,
  border: 0x2a2a45,
  orange: 0xff6b2b,
  green: 0x00e676,
  red: 0xff1744,
  textMuted: 0x6b6b8a,
  atmosphere: 0xff6b2b,
};

// GeoJSON URL for country polygons (Natural Earth 110m simplified)
const COUNTRIES_GEOJSON_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';

// ---------------------------------------------------------------------------
// Component (dynamically imported — no SSR)
// ---------------------------------------------------------------------------

export function NarrativeGlobe({ points, arcs, width, height, onPointClick }: NarrativeGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<unknown>(null);
  const rendererRef = useRef<unknown>(null);
  const frameRef = useRef<number>(0);
  const mouseDown = useRef(false);
  const autoRotateSpeed = useRef(0.2);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track current data for updates
  const pointsRef = useRef(points);
  const arcsRef = useRef(arcs);
  pointsRef.current = points;
  arcsRef.current = arcs;

  const initGlobe = useCallback(async (): Promise<(() => void) | undefined> => {
    if (!containerRef.current) return undefined;

    try {
      // Dynamic imports for Three.js and three-globe (client-side only)
      const THREE = await import('three');
      const { default: ThreeGlobe } = await import('three-globe');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');

      const container = containerRef.current;
      const w = width ?? container.clientWidth;
      const h = height ?? container.clientHeight;

      // ---- Scene ----
      const scene = new THREE.Scene();
      scene.background = null; // transparent — blends with page bg

      // ---- Camera ----
      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
      camera.position.set(0, 0, 340);

      // ---- Renderer ----
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

      // ---- Globe ----
      const globe = new ThreeGlobe({ animateIn: true })
        .showGlobe(true)
        .showAtmosphere(true)
        .atmosphereColor('#FF6B2B')
        .atmosphereAltitude(0.18);

      // Dark globe material
      const globeMaterial = globe.globeMaterial() as InstanceType<typeof THREE.MeshPhongMaterial>;
      globeMaterial.color.setHex(NERV_COLORS.bgDeep);
      globeMaterial.transparent = true;
      globeMaterial.opacity = 0.85;
      globeMaterial.shininess = 0.4;

      // Fetch country polygons and apply
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
        // Country polygons are cosmetic — continue without them
      }

      // ---- Configure points ----
      globe
        .pointsData(pointsRef.current)
        .pointLat((d: unknown) => (d as GlobePoint).lat)
        .pointLng((d: unknown) => (d as GlobePoint).lng)
        .pointAltitude((d: unknown) => {
          const p = d as GlobePoint;
          return p.type === 'origin' ? 0.06 : 0.02 + p.size * 0.04;
        })
        .pointRadius((d: unknown) => {
          const p = d as GlobePoint;
          return p.type === 'origin' ? 0.8 : 0.3 + p.size * 0.5;
        })
        .pointColor((d: unknown) => (d as GlobePoint).color)
        .pointResolution(6); // hexagonal shape

      // ---- Configure arcs ----
      globe
        .arcsData(arcsRef.current)
        .arcStartLat((d: unknown) => (d as GlobeArc).startLat)
        .arcStartLng((d: unknown) => (d as GlobeArc).startLng)
        .arcEndLat((d: unknown) => (d as GlobeArc).endLat)
        .arcEndLng((d: unknown) => (d as GlobeArc).endLng)
        .arcColor((d: unknown) => (d as GlobeArc).color)
        .arcStroke((d: unknown) => (d as GlobeArc).stroke)
        .arcDashLength(0.6)
        .arcDashGap(0.3)
        .arcDashAnimateTime(2500)
        .arcAltitudeAutoScale(0.4);

      // ---- Configure labels ----
      globe
        .labelsData(pointsRef.current.filter((p) => p.size > 0.3 || p.type === 'origin'))
        .labelLat((d: unknown) => (d as GlobePoint).lat)
        .labelLng((d: unknown) => (d as GlobePoint).lng)
        .labelText((d: unknown) => (d as GlobePoint).label)
        .labelSize(0.8)
        .labelDotRadius(0.3)
        .labelColor((d: unknown) => {
          const p = d as GlobePoint;
          return p.type === 'origin' ? '#FF6B2B' : '#8888aa';
        })
        .labelResolution(2)
        .labelAltitude(0.01);

      scene.add(globe);
      globeRef.current = globe;

      // ---- Lights ----
      const ambientLight = new THREE.AmbientLight(0x444466, 1.2);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
      dirLight.position.set(200, 200, 200);
      scene.add(dirLight);

      // Faint orange accent light
      const accentLight = new THREE.PointLight(NERV_COLORS.orange, 0.3, 800);
      accentLight.position.set(-200, 100, 200);
      scene.add(accentLight);

      // ---- Background stars ----
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

      // ---- Orbit Controls ----
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.enablePan = false;
      controls.minDistance = 150;
      controls.maxDistance = 600;
      controls.rotateSpeed = 0.5;
      controls.zoomSpeed = 0.8;

      // Track mouse for auto-rotation pause
      renderer.domElement.addEventListener('mousedown', () => {
        mouseDown.current = true;
      });
      renderer.domElement.addEventListener('mouseup', () => {
        mouseDown.current = false;
      });
      renderer.domElement.addEventListener('touchstart', () => {
        mouseDown.current = true;
      });
      renderer.domElement.addEventListener('touchend', () => {
        mouseDown.current = false;
      });

      // ---- Click detection for points ----
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      renderer.domElement.addEventListener('click', (event: MouseEvent) => {
        if (!onPointClick) return;
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        // Check intersection with globe points group
        const intersects = raycaster.intersectObjects(globe.children, true);
        if (intersects.length > 0) {
          // Find closest matching point by distance
          const hitPoint = intersects[0].point;
          let closest: GlobePoint | null = null;
          let closestDist = Infinity;
          for (const p of pointsRef.current) {
            // Convert lat/lng to 3D position on globe
            const phi = (90 - p.lat) * (Math.PI / 180);
            const theta = (p.lng + 180) * (Math.PI / 180);
            const r = 100; // approximate globe radius
            const x = -(r * Math.sin(phi) * Math.cos(theta));
            const y = r * Math.cos(phi);
            const z = r * Math.sin(phi) * Math.sin(theta);
            const dist = hitPoint.distanceTo(new THREE.Vector3(x, y, z));
            if (dist < closestDist && dist < 20) {
              closestDist = dist;
              closest = p;
            }
          }
          if (closest) onPointClick(closest);
        }
      });

      // ---- Pulsing origin points via shader clock ----
      let pulsePhase = 0;

      // ---- Animation loop ----
      const animate = () => {
        frameRef.current = requestAnimationFrame(animate);
        pulsePhase += 0.03;

        // Auto-rotate when not interacting
        if (!mouseDown.current) {
          globe.rotation.y += autoRotateSpeed.current * 0.002;
        }

        // Pulse origin points by modulating altitude
        const originPoints = pointsRef.current.filter((p) => p.type === 'origin');
        if (originPoints.length > 0) {
          globe.pointAltitude((d: unknown) => {
            const p = d as GlobePoint;
            if (p.type === 'origin') {
              return 0.04 + 0.03 * Math.sin(pulsePhase);
            }
            return 0.02 + p.size * 0.04;
          });
        }

        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // ---- Handle resize ----
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

      // ---- Cleanup ----
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
  }, [width, height, onPointClick]);

  // Init globe on mount
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

  // Update data when points/arcs change
  useEffect(() => {
    const globe = globeRef.current as {
      pointsData: (d: GlobePoint[]) => void;
      arcsData: (d: GlobeArc[]) => void;
      labelsData: (d: GlobePoint[]) => void;
    } | null;
    if (!globe || !loaded) return;

    globe.pointsData(points);
    globe.arcsData(arcs);
    globe.labelsData(points.filter((p) => p.size > 0.3 || p.type === 'origin'));
  }, [points, arcs, loaded]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      {/* Loading state */}
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-orange animate-nerv-pulse">
              INITIALIZING GLOBE RENDERER...
            </div>
            <div className="mt-2 w-32 h-px bg-nerv-border mx-auto overflow-hidden">
              <div className="h-full bg-nerv-orange animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
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

      {/* HUD overlay — top left info */}
      {loaded && points.length > 0 && (
        <div className="absolute top-3 left-3 pointer-events-none">
          <div className="text-[9px] font-mono uppercase tracking-widest text-nerv-text-muted mb-1">
            GEOGRAPHIC DISTRIBUTION
          </div>
          <div className="text-[10px] font-mono text-nerv-orange">
            {points.length} {points.length === 1 ? 'REGION' : 'REGIONS'} ACTIVE
          </div>
          {arcs.length > 0 && (
            <div className="text-[9px] font-mono text-nerv-text-muted mt-0.5">
              {arcs.length} PROPAGATION {arcs.length === 1 ? 'LINK' : 'LINKS'}
            </div>
          )}
        </div>
      )}

      {/* HUD overlay — legend */}
      {loaded && points.length > 0 && (
        <div className="absolute bottom-3 left-3 pointer-events-none">
          <div className="flex items-center gap-3 text-[8px] font-mono uppercase tracking-wider text-nerv-text-muted">
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: '#FF6B2B' }}
              />
              ORIGIN
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: '#00E676' }}
              />
              POSITIVE
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: '#FF1744' }}
              />
              NEGATIVE
            </span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {loaded && points.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-[10px] font-mono uppercase tracking-widest text-nerv-text-muted">
              NO GEOGRAPHIC SIGNALS DETECTED
            </div>
            <div className="text-[9px] font-mono text-nerv-text-muted mt-1 max-w-xs">
              Geographic data is derived from country mentions in posts, GDELT signals, and
              investigation results.
            </div>
          </div>
        </div>
      )}

      {/* Scan-line overlay effect */}
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
