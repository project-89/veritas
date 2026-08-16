import { conditionalFeedFetch, parseRetryAfter } from '../src/lib/conditional-feed-fetch';

describe('parseRetryAfter', () => {
  it('parses a seconds value', () => {
    expect(parseRetryAfter('120')).toBe(120000);
  });

  it('parses an HTTP date into a delay', () => {
    const future = new Date(Date.now() + 60000).toUTCString();
    const ms = parseRetryAfter(future);
    expect(ms).toBeGreaterThan(50000);
    expect(ms).toBeLessThanOrEqual(60000);
  });

  it('never returns a negative delay for a past date', () => {
    expect(parseRetryAfter(new Date(Date.now() - 60000).toUTCString())).toBe(0);
  });

  it('returns undefined for a missing or unparseable header', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon-ish')).toBeUndefined();
  });
});

describe('conditionalFeedFetch', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  interface MockResponse {
    status?: number;
    body?: string;
    headers?: Record<string, string>;
  }

  function mockFetch(res: MockResponse): jest.Mock {
    const headers = new Map(Object.entries(res.headers ?? {}));
    const status = res.status ?? 200;
    const fn = jest.fn().mockResolvedValue({
      status,
      ok: status < 400,
      headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
      text: async () => res.body ?? '',
    });
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  it('sends validators when they are known', async () => {
    const fn = mockFetch({ status: 304 });

    await conditionalFeedFetch('https://example.com/feed', {
      etag: 'W/"abc"',
      lastModified: 'Wed, 21 Oct 2026 07:28:00 GMT',
    });

    const headers = fn.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers['If-None-Match']).toBe('W/"abc"');
    expect(headers['If-Modified-Since']).toBe('Wed, 21 Oct 2026 07:28:00 GMT');
  });

  it('sends no validators on a first fetch', async () => {
    const fn = mockFetch({ status: 200, body: '<rss/>' });

    await conditionalFeedFetch('https://example.com/feed');

    const headers = fn.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers['If-None-Match']).toBeUndefined();
    expect(headers['If-Modified-Since']).toBeUndefined();
  });

  it('reports 304 as not-modified so the caller can reuse its cache', async () => {
    mockFetch({ status: 304 });
    // This is the whole point: an unchanged feed costs a tiny response
    // instead of a full re-download.
    await expect(conditionalFeedFetch('https://example.com/feed', { etag: 'x' })).resolves.toEqual({
      status: 'not-modified',
    });
  });

  it('returns the body and the validators to persist', async () => {
    mockFetch({
      status: 200,
      body: '<rss>hello</rss>',
      headers: { etag: 'W/"v2"', 'last-modified': 'Wed, 21 Oct 2026 07:28:00 GMT' },
    });

    const result = await conditionalFeedFetch('https://example.com/feed');

    expect(result).toEqual({
      status: 'modified',
      body: '<rss>hello</rss>',
      validators: { etag: 'W/"v2"', lastModified: 'Wed, 21 Oct 2026 07:28:00 GMT' },
    });
  });

  it('surfaces a 429 with its Retry-After so the caller can back off', async () => {
    mockFetch({ status: 429, headers: { 'retry-after': '300' } });

    await expect(conditionalFeedFetch('https://example.com/feed')).resolves.toEqual({
      status: 'rate-limited',
      retryAfterMs: 300000,
    });
  });

  it('treats 503 as rate-limited too', async () => {
    mockFetch({ status: 503 });
    const result = await conditionalFeedFetch('https://example.com/feed');
    expect(result.status).toBe('rate-limited');
  });

  it('reports HTTP errors without throwing', async () => {
    mockFetch({ status: 404 });
    await expect(conditionalFeedFetch('https://example.com/feed')).resolves.toMatchObject({
      status: 'error',
      statusCode: 404,
    });
  });

  it('reports network failure without throwing, so one dead feed cannot abort a cycle', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    await expect(conditionalFeedFetch('https://example.com/feed')).resolves.toMatchObject({
      status: 'error',
    });
  });

  it('identifies itself with a reachable contact URL', async () => {
    const fn = mockFetch({ status: 200, body: '<rss/>' });

    await conditionalFeedFetch('https://example.com/feed');

    const headers = fn.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers['User-Agent']).toContain('github.com/project-89/veritas');
    expect(headers['User-Agent']).not.toContain('oneirocom');
  });
});
