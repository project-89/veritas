import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

/**
 * Live commercial-vessel positions from AISStream.io — the "movement of
 * resources" layer (cargo + tankers), complementing GFW's discrete
 * intelligence events.
 *
 * Deliberately NOT a global firehose (tens of thousands of msgs/min, mostly
 * noise). It subscribes to the major shipping CHOKEPOINTS — the arteries
 * through which resource flow is actually legible — which bounds volume and
 * raises signal at once. Filtered to cargo (AIS type 70-79) and tanker
 * (80-89).
 *
 * Free but key-gated: set AISSTREAM_API_KEY (free from aisstream.io). Without
 * it the service is inert and reports unavailable.
 *
 * Docs: https://aisstream.io/documentation
 */

const AIS_WS_URL = 'wss://stream.aisstream.io/v0/stream';
const STALE_MS = 30 * 60 * 1000; // drop a vessel not heard from in 30 min
const MAX_VESSELS = 3000; // hard bound on the in-memory store
const RECONNECT_MS = 15_000;

// [[southLat, westLon], [northLat, eastLon]] per box — the world's key straits
// and canals. Resource flow concentrates here; watching the arteries beats
// watching the whole ocean.
const CHOKEPOINTS: number[][][] = [
  [[24, 54], [27, 58]], // Strait of Hormuz
  [[27, 32], [31, 34]], // Suez Canal / northern Red Sea
  [[12, 42], [14, 44]], // Bab-el-Mandeb
  [[1, 99], [6, 104]], // Strait of Malacca
  [[8, -80], [10, -79]], // Panama Canal
  [[35, -6], [36, -5]], // Strait of Gibraltar
  [[50, 1], [51, 2]], // English Channel / Dover
  [[40.9, 28.9], [41.3, 29.2]], // Bosphorus
];

export type VesselClass = 'cargo' | 'tanker' | 'other';

export interface VesselRecord {
  mmsi: number;
  name: string;
  shipClass: VesselClass;
  lat: number;
  lng: number;
  /** Speed over ground (knots) and course over ground (degrees), when known. */
  sog?: number;
  cog?: number;
  destination?: string;
  updatedAt: number;
}

/** AIS ship-type code → coarse class. 70-79 cargo, 80-89 tanker. */
export function classifyShipType(type: number | undefined): VesselClass {
  if (typeof type !== 'number') return 'other';
  if (type >= 70 && type <= 79) return 'cargo';
  if (type >= 80 && type <= 89) return 'tanker';
  return 'other';
}

export interface VesselUpdate {
  mmsi: number;
  name?: string;
  lat?: number;
  lng?: number;
  sog?: number;
  cog?: number;
  shipType?: number;
  destination?: string;
}

/**
 * Pure parse of one AISStream message → a normalized update (or null).
 * Exported so parsing is unit-testable without a live socket.
 */
export function parseAisMessage(raw: unknown): VesselUpdate | null {
  if (!raw || typeof raw !== 'object') return null;
  const msg = raw as {
    MessageType?: string;
    MetaData?: { MMSI?: number; ShipName?: string; latitude?: number; longitude?: number };
    Message?: {
      PositionReport?: { Latitude?: number; Longitude?: number; Sog?: number; Cog?: number };
      ShipStaticData?: { Type?: number; Destination?: string };
    };
  };
  const mmsi = msg.MetaData?.MMSI;
  if (typeof mmsi !== 'number') return null;

  const update: VesselUpdate = { mmsi };
  const name = msg.MetaData?.ShipName?.trim();
  if (name) update.name = name;

  const pos = msg.Message?.PositionReport;
  const lat = pos?.Latitude ?? msg.MetaData?.latitude;
  const lng = pos?.Longitude ?? msg.MetaData?.longitude;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    update.lat = lat;
    update.lng = lng;
  }
  if (Number.isFinite(pos?.Sog)) update.sog = pos?.Sog;
  if (Number.isFinite(pos?.Cog)) update.cog = pos?.Cog;

  const stat = msg.Message?.ShipStaticData;
  if (stat) {
    if (typeof stat.Type === 'number') update.shipType = stat.Type;
    if (stat.Destination?.trim()) update.destination = stat.Destination.trim();
  }
  return update;
}

@Injectable()
export class AisStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AisStreamService.name);
  private readonly apiKey = process.env['AISSTREAM_API_KEY'];
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private readonly vessels = new Map<number, VesselRecord>();

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  onModuleInit(): void {
    if (!this.apiKey) {
      this.logger.log('AISStream disabled (set AISSTREAM_API_KEY to enable)');
      return;
    }
    this.connect();
    this.sweepTimer = setInterval(() => this.sweep(), 5 * 60 * 1000);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.socket?.close();
  }

  /** Current cargo/tanker positions, most-recently-seen first. */
  getVessels(limit = 500): VesselRecord[] {
    return [...this.vessels.values()]
      .filter((v) => v.shipClass !== 'other')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  /** Apply a parsed update to the store. Exposed for tests. */
  applyUpdate(update: VesselUpdate, now: number): void {
    const existing = this.vessels.get(update.mmsi);
    const shipClass = update.shipType !== undefined ? classifyShipType(update.shipType) : undefined;
    // Once we learn a vessel is neither cargo nor tanker, drop it — this is the
    // resource-movement layer, not all traffic.
    if (shipClass === 'other') {
      this.vessels.delete(update.mmsi);
      return;
    }
    if (update.lat === undefined || update.lng === undefined) {
      // Static-only message: enrich an existing record, don't create a
      // position-less one.
      if (existing) {
        if (shipClass) existing.shipClass = shipClass;
        if (update.name) existing.name = update.name;
        if (update.destination) existing.destination = update.destination;
        existing.updatedAt = now;
      }
      return;
    }
    const record: VesselRecord = {
      mmsi: update.mmsi,
      name: update.name ?? existing?.name ?? String(update.mmsi),
      shipClass: shipClass ?? existing?.shipClass ?? 'cargo',
      lat: update.lat,
      lng: update.lng,
      sog: update.sog ?? existing?.sog,
      cog: update.cog ?? existing?.cog,
      destination: update.destination ?? existing?.destination,
      updatedAt: now,
    };
    this.vessels.set(update.mmsi, record);
    if (this.vessels.size > MAX_VESSELS) this.sweep();
  }

  private connect(): void {
    if (this.closed || !this.apiKey) return;
    try {
      const ws = new WebSocket(AIS_WS_URL);
      this.socket = ws;
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            APIKey: this.apiKey,
            BoundingBoxes: CHOKEPOINTS,
            FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
          }),
        );
        this.logger.log(`AISStream connected — watching ${CHOKEPOINTS.length} chokepoints`);
      };
      ws.onmessage = (ev: MessageEvent) => {
        try {
          const update = parseAisMessage(JSON.parse(String(ev.data)));
          if (update) this.applyUpdate(update, Date.now());
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => this.scheduleReconnect();
      ws.onerror = () => {
        this.logger.warn('AISStream socket error — will reconnect');
        ws.close();
      };
    } catch (err) {
      this.logger.warn(`AISStream connect failed: ${err}`);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_MS);
    this.reconnectTimer.unref?.();
  }

  private sweep(): void {
    const cutoff = Date.now() - STALE_MS;
    for (const [mmsi, v] of this.vessels) {
      if (v.updatedAt < cutoff) this.vessels.delete(mmsi);
    }
    // Hard cap: if still over, drop the oldest.
    if (this.vessels.size > MAX_VESSELS) {
      const sorted = [...this.vessels.values()].sort((a, b) => a.updatedAt - b.updatedAt);
      for (const v of sorted.slice(0, this.vessels.size - MAX_VESSELS)) {
        this.vessels.delete(v.mmsi);
      }
    }
  }
}
