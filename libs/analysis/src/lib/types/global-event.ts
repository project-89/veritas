// ---------------------------------------------------------------------------
// GlobalEvent — real-time events from external signal sources (USGS, GDELT, ACLED)
// ---------------------------------------------------------------------------

export type EventCategory = 'environmental' | 'political' | 'economic' | 'media';
export type EventSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface GeoLocation {
  lat: number;
  lng: number;
  label: string;
  countryCode?: string;
  region?: string;
}

export interface GlobalEvent {
  id: string;
  source: string;
  category: EventCategory;
  severity: EventSeverity;
  title: string;
  description: string;
  timestamp: string;
  location: GeoLocation;
  magnitude: number;
  metadata: Record<string, unknown>;
  expiresAt: string;
}
