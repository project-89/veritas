type PostLike = {
  platform?: string | null;
  authorHandle?: string | null;
  authorName?: string | null;
  url?: string | null;
  timestamp?: string | Date | null;
  text?: string | null;
};

function normalizeWhitespace(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeUrl(value: string | null | undefined): string {
  if (!value) return '';

  try {
    const parsed = new URL(value);
    parsed.hash = '';
    const params = new URLSearchParams(parsed.search);
    for (const key of [...params.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) {
        params.delete(key);
      }
    }
    parsed.search = params.toString();
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return normalizeWhitespace(value).replace(/\/$/, '');
  }
}

function normalizeTimestampBucket(value: string | Date | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 13);
}

export function buildPostDedupKey(post: PostLike): string {
  const platform = normalizeWhitespace(post.platform ?? '') || 'unknown';
  const url = normalizeUrl(post.url);
  if (url) {
    return `${platform}::url::${url}`;
  }

  const author = normalizeWhitespace(post.authorHandle ?? post.authorName ?? '') || 'unknown';
  const timeBucket = normalizeTimestampBucket(post.timestamp);
  const text = normalizeWhitespace(post.text ?? '').slice(0, 240);
  return [platform, author, timeBucket, text].join('::');
}
