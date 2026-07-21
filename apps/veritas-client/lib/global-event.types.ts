export type EventCategory = 'environmental' | 'political' | 'economic' | 'media' | 'maritime';
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

export const EVENT_COLORS: Record<EventCategory, string> = {
  environmental: '#00E676',
  political: '#FF1744',
  economic: '#FFD600',
  media: '#2979FF',
  maritime: '#00E5FF',
};
