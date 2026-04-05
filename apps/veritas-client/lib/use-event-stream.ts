import { useState, useEffect, useRef } from 'react';
import type { GlobalEvent } from './global-event.types';

const MAX_EVENTS = 500;
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

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
      .then(data => setEvents(Array.isArray(data) ? data.slice(0, MAX_EVENTS) : []))
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
        setEvents(prev => {
          const next = [event, ...prev];
          return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
        });
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
