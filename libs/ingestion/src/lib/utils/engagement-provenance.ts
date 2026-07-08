/**
 * Per-platform engagement-metric provenance.
 *
 * Connectors populate engagement metrics with wildly different fidelity: some
 * are real platform counts, some we infer/estimate, and many are hardcoded 0
 * because the source simply doesn't expose them. Rendering an unavailable
 * metric as "0 likes" is a lie in an intelligence tool. This map is the single
 * source of truth for which metrics each platform genuinely provides, so the
 * API and UI can mark numbers as real, inferred, or unavailable.
 *
 * Keep in sync with connector behavior — if a connector changes what it
 * populates, update the corresponding row here.
 */

export type MetricProvenance = 'real' | 'inferred' | 'unavailable';

export type EngagementMetricKey = 'likes' | 'shares' | 'comments' | 'reach' | 'views';

export type EngagementProvenance = Record<EngagementMetricKey, MetricProvenance>;

const ALL_UNAVAILABLE: EngagementProvenance = {
  likes: 'unavailable',
  shares: 'unavailable',
  comments: 'unavailable',
  reach: 'unavailable',
  views: 'unavailable',
};

const PLATFORM_PROVENANCE: Record<string, EngagementProvenance> = {
  // Public JSON API: score→likes and comments are real; reach is inferred from
  // score/upvote-ratio; Reddit has no share or view counts.
  reddit: { likes: 'real', shares: 'unavailable', comments: 'real', reach: 'inferred', views: 'unavailable' },
  // AT Protocol public API returns real like/repost/reply counts; no reach.
  bluesky: { likes: 'real', shares: 'real', comments: 'real', reach: 'unavailable', views: 'unavailable' },
  // Scraper surfaces real engagement when it works; no reach figure.
  twitter: { likes: 'real', shares: 'real', comments: 'real', reach: 'unavailable', views: 'inferred' },
  // Neynar returns real like/recast/reply counts; no reach.
  farcaster: { likes: 'real', shares: 'real', comments: 'real', reach: 'unavailable', views: 'unavailable' },
  // yt-dlp exposes real view/like/comment counts; no reach.
  youtube: { likes: 'real', shares: 'unavailable', comments: 'real', reach: 'unavailable', views: 'real' },
  // t.me web preview exposes view counts only; no likes/shares/replies.
  telegram: { likes: 'unavailable', shares: 'unavailable', comments: 'unavailable', reach: 'unavailable', views: 'real' },
  // 4chan catalog gives reply and image counts (mapped to comments); no likes.
  '4chan': { likes: 'unavailable', shares: 'unavailable', comments: 'real', reach: 'unavailable', views: 'unavailable' },
  // RSS feeds carry no engagement data at all.
  rss: ALL_UNAVAILABLE,
  // Jina page-monitoring fabricates zeros — nothing is real.
  facebook: ALL_UNAVAILABLE,
  // Wikipedia current-events has no engagement concept.
  wikipedia: ALL_UNAVAILABLE,
  // truthbrush exposes some counts; treat conservatively until validated.
  truthsocial: { likes: 'real', shares: 'real', comments: 'real', reach: 'unavailable', views: 'unavailable' },
  // Generic scraper has no reliable engagement.
  web: ALL_UNAVAILABLE,
};

/**
 * Provenance for a platform's engagement metrics. Unknown platforms are
 * treated as fully unavailable — safer to under-claim than to imply real data.
 */
export function getEngagementProvenance(platform: string): EngagementProvenance {
  return PLATFORM_PROVENANCE[platform.toLowerCase()] ?? ALL_UNAVAILABLE;
}
