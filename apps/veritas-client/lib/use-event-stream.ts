import { useState, useEffect, useRef } from 'react';
import type { GlobalEvent } from './global-event.types';

const MAX_EVENTS = 500;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

function roundCoord(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : '0.0';
}

function bucketTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'invalid';
  const bucketMs = 15 * 60 * 1000;
  return String(Math.floor(date.getTime() / bucketMs));
}

function eventSignature(event: GlobalEvent): string {
  return [
    event.source,
    event.category,
    normalizeTitle(event.title),
    roundCoord(event.location.lat),
    roundCoord(event.location.lng),
    bucketTimestamp(event.timestamp),
  ].join('|');
}

function mergeEvents(existing: GlobalEvent[], incoming: GlobalEvent[]): GlobalEvent[] {
  const byId = new Map<string, GlobalEvent>();
  const signatureToId = new Map<string, string>();

  for (const event of [...incoming, ...existing]) {
    const signature = eventSignature(event);
    const existingBySignatureId = signatureToId.get(signature);

    if (existingBySignatureId && existingBySignatureId !== event.id) {
      const current = byId.get(existingBySignatureId);
      if (!current) {
        signatureToId.set(signature, event.id);
        byId.set(event.id, event);
        continue;
      }

      const currentTs = new Date(current.timestamp).getTime();
      const nextTs = new Date(event.timestamp).getTime();
      const keepIncoming = Number.isFinite(nextTs) && (!Number.isFinite(currentTs) || nextTs >= currentTs);

      if (keepIncoming) {
        byId.delete(existingBySignatureId);
        byId.set(event.id, event);
        signatureToId.set(signature, event.id);
      }
      continue;
    }

    const existingById = byId.get(event.id);
    if (!existingById) {
      byId.set(event.id, event);
      signatureToId.set(signature, event.id);
      continue;
    }

    const existingTs = new Date(existingById.timestamp).getTime();
    const nextTs = new Date(event.timestamp).getTime();
    if (Number.isFinite(nextTs) && (!Number.isFinite(existingTs) || nextTs >= existingTs)) {
      byId.set(event.id, event);
      signatureToId.set(signature, event.id);
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_EVENTS);
}

export function useEventStream(options?: {
  categories?: string[];
  regions?: string[];
}): { events: GlobalEvent[]; connected: boolean; error: string | null } {
  const [events, setEvents] = useState<GlobalEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // 1. Fetch recent events for initial state
    fetch(`${API_BASE}/events/recent?limit=200`)
      .then(r => r.json())
      .then(data => setEvents(Array.isArray(data) ? mergeEvents([], data as GlobalEvent[]) : []))
      .catch(() => {});

    // 2. Open SSE connection
    const params = new URLSearchParams();
    if (options?.categories?.length) params.set('categories', options.categories.join(','));
    if (options?.regions?.length) params.set('regions', options.regions.join(','));

    const url = `${API_BASE}/events/stream${params.toString() ? `?${params}` : ''}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('event', (e) => {
      try {
        const event = JSON.parse(e.data) as GlobalEvent;
        setEvents(prev => mergeEvents(prev, [event]));
      } catch {
        // Ignore malformed events
      }
    });

    es.onopen = () => { setConnected(true); setError(null); };
    es.onerror = () => { setConnected(false); setError('Connection lost — reconnecting...'); };

    return () => { es.close(); };
  }, []); // Intentionally no deps — connect once on mount

  return { events, connected, error };
}
