import { Logger } from '@nestjs/common';
import type { ExternalSignal, SignalAdapter } from './signal-adapter.interface';

const USER_AGENT = 'Mozilla/5.0 (compatible; Veritas/2.0; +https://github.com/oneirocom/veritas)';
const OAUTH_URL = 'https://acleddata.com/oauth/token';
const READ_URL = 'https://acleddata.com/api/acled/read';
const CLIENT_ID = 'acled';
// Refresh a little before the stated 24h expiry to avoid edge-of-expiry 401s.
const TOKEN_SKEW_MS = 5 * 60 * 1000;

/**
 * ACLED (Armed Conflict Location & Event Data) adapter.
 *
 * Uses ACLED's current OAuth-based API (they retired the old key+email query
 * scheme). Requires a free myACLED account for non-commercial/research use —
 * set ACLED_USERNAME (the account email) and ACLED_PASSWORD. Commercial use
 * needs a paid license from ACLED.
 *
 * Auth flow: password grant → access token (24h) cached on the instance,
 * refreshed via the refresh token (14d), re-authenticated from scratch if the
 * refresh token has also expired.
 *
 * The high-value payload is the georeferenced event stream: armed battles,
 * violence against civilians, explosions/remote violence, protests and riots —
 * with actors, fatalities, and lat/lng, so they place on the map and correlate
 * with the narrative layer.
 *
 * Docs: https://acleddata.com/api-documentation/getting-started
 */
export class AcledAdapter implements SignalAdapter {
  readonly domain = 'political';
  readonly scope = 'global' as const;
  readonly maxAgeMs = 6 * 60 * 60 * 1000; // 6 hours
  readonly name = 'ACLED Conflict Events';

  private readonly logger = new Logger(AcledAdapter.name);
  private warnedMissingKey = false;

  private accessToken: string | null = null;
  private accessTokenExpiry = 0;
  private refreshToken: string | null = null;
  private refreshTokenExpiry = 0;

  async fetchSignals(params: {
    keywords: string[];
    startDate: string;
    endDate: string;
  }): Promise<ExternalSignal[]> {
    const username = process.env['ACLED_USERNAME'];
    const password = process.env['ACLED_PASSWORD'];
    if (!username || !password) {
      if (!this.warnedMissingKey) {
        this.warnedMissingKey = true;
        this.logger.log(
          'ACLED_USERNAME / ACLED_PASSWORD not set — conflict event data unavailable. ' +
            'Register a free myACLED account at acleddata.com (non-commercial use).',
        );
      }
      return [];
    }

    const token = await this.ensureToken(username, password);
    if (!token) return [];

    const url = new URL(READ_URL);
    url.searchParams.set('_format', 'json');
    url.searchParams.set('limit', '200');
    url.searchParams.set('event_date', `${this.toAcledDate(params.startDate)}|${this.toAcledDate(params.endDate)}`);
    url.searchParams.set('event_date_where', 'BETWEEN');

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          headers: { 'User-Agent': USER_AGENT, Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(20_000),
        });
        if (response.status === 401 && attempt === 0) {
          // Token rejected mid-life — force a fresh grant and retry once.
          this.accessToken = null;
          const fresh = await this.ensureToken(username, password);
          if (!fresh) return [];
          continue;
        }
        if (!response.ok) {
          // Surface ACLED's own message — a 403 "Access denied" with a valid
          // token means the account lacks API/data-access entitlement (grant
          // it in the myACLED dashboard), NOT a code or credential problem.
          const body = await response.text().catch(() => '');
          const detail = body.slice(0, 200);
          this.logger.warn(
            `ACLED read HTTP ${response.status}${detail ? ` — ${detail}` : ''}` +
              (response.status === 403
                ? ' (token is valid; enable API/data access on the myACLED account)'
                : ''),
          );
          return [];
        }
        return this.mapEvents((await response.json()) as AcledResponse);
      } catch (err) {
        this.logger.warn(`ACLED fetch failed: ${err}`);
        return [];
      }
    }
    return [];
  }

  // ---------------------------------------------------------------------------
  // OAuth token management
  // ---------------------------------------------------------------------------

  private async ensureToken(username: string, password: string): Promise<string | null> {
    const now = Date.now();
    if (this.accessToken && now < this.accessTokenExpiry - TOKEN_SKEW_MS) {
      return this.accessToken;
    }
    if (this.refreshToken && now < this.refreshTokenExpiry) {
      const refreshed = await this.requestToken({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: CLIENT_ID,
      });
      if (refreshed) return refreshed;
      // Refresh failed — fall through to a full password grant.
    }
    return this.requestToken({
      grant_type: 'password',
      username,
      password,
      client_id: CLIENT_ID,
      scope: 'authenticated',
    });
  }

  private async requestToken(fields: Record<string, string>): Promise<string | null> {
    try {
      const response = await fetch(OAUTH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body: new URLSearchParams(fields).toString(),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        this.logger.warn(`ACLED OAuth (${fields['grant_type']}) failed: HTTP ${response.status}`);
        return null;
      }
      const data = (await response.json()) as AcledTokenResponse;
      const parsed = parseTokenResponse(data, Date.now());
      if (!parsed) return null;
      this.accessToken = parsed.accessToken;
      this.accessTokenExpiry = parsed.accessTokenExpiry;
      this.refreshToken = parsed.refreshToken;
      this.refreshTokenExpiry = parsed.refreshTokenExpiry;
      return this.accessToken;
    } catch (err) {
      this.logger.warn(`ACLED OAuth request errored: ${err}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  private mapEvents(data: AcledResponse): ExternalSignal[] {
    if (!data.data || !Array.isArray(data.data)) return [];
    return data.data.map((event, i) => {
      const fatalities = Number(event.fatalities) || 0;
      const lat = Number(event.latitude);
      const lng = Number(event.longitude);
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
      const actors = [event.actor1, event.actor2].filter(Boolean).join(' vs ');
      return {
        id: `acled-${(event as Record<string, unknown>)['event_id_cnty'] ?? (event as Record<string, unknown>)['data_id'] ?? i}`,
        domain: 'political' as const,
        source: 'ACLED',
        title: `${event.event_type ?? 'Conflict event'} — ${event.location ?? event.country ?? 'Unknown'}`,
        description: [
          event.sub_event_type,
          actors || null,
          event.country,
          fatalities > 0 ? `${fatalities} fatalities` : null,
        ]
          .filter(Boolean)
          .join(' | '),
        timestamp: this.parseEventDate(event.event_date),
        magnitude: this.fatalitiesMagnitude(fatalities),
        metadata: {
          ...(hasCoords ? { coordinates: { latitude: lat, longitude: lng } } : {}),
          event_type: event.event_type ?? '',
          sub_event_type: event.sub_event_type ?? '',
          country: event.country ?? '',
          location: event.location ?? '',
          actors,
          fatalities,
          source: event.source ?? '',
        },
      };
    });
  }

  private toAcledDate(isoDate: string): string {
    const d = new Date(isoDate);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }

  private parseEventDate(dateStr?: string): string {
    if (!dateStr) return new Date().toISOString();
    try {
      return new Date(dateStr).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /** Fatalities → 0-1 magnitude. 0=0.1, 1-5=0.3, 6-20=0.5, 21-100=0.7, 100+=1.0 */
  private fatalitiesMagnitude(fatalities: number): number {
    if (fatalities <= 0) return 0.1;
    if (fatalities <= 5) return 0.3;
    if (fatalities <= 20) return 0.5;
    if (fatalities <= 100) return 0.7;
    return 1.0;
  }
}

// ---------------------------------------------------------------------------
// Token parsing (pure — unit-testable without a live OAuth call)
// ---------------------------------------------------------------------------

export interface AcledTokenResponse {
  token_type?: string;
  expires_in?: number;
  access_token?: string;
  refresh_token?: string;
}

export function parseTokenResponse(
  data: AcledTokenResponse,
  now: number,
): {
  accessToken: string;
  accessTokenExpiry: number;
  refreshToken: string | null;
  refreshTokenExpiry: number;
} | null {
  if (!data.access_token) return null;
  const accessLifetimeMs = (data.expires_in ?? 86_400) * 1000;
  return {
    accessToken: data.access_token,
    accessTokenExpiry: now + accessLifetimeMs,
    refreshToken: data.refresh_token ?? null,
    // Refresh token is documented as valid 14 days.
    refreshTokenExpiry: now + 14 * 24 * 60 * 60 * 1000,
  };
}

// ---------------------------------------------------------------------------
// ACLED response types
// ---------------------------------------------------------------------------

export interface AcledEvent {
  event_date?: string;
  event_type?: string;
  sub_event_type?: string;
  actor1?: string;
  actor2?: string;
  country?: string;
  region?: string;
  location?: string;
  latitude?: string | number;
  longitude?: string | number;
  fatalities?: string | number;
  source?: string;
}

export interface AcledResponse {
  status?: number;
  success?: boolean;
  data?: AcledEvent[];
}
