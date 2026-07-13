import { WaybackEvidenceAdapter } from './wayback.evidence-adapter';

describe('WaybackEvidenceAdapter', () => {
  let adapter: WaybackEvidenceAdapter;
  const originalFetch = global.fetch;

  beforeEach(() => {
    adapter = new WaybackEvidenceAdapter();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function mockCdx(rows: string[][]) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [['timestamp', 'original', 'statuscode'], ...rows],
    }) as unknown as typeof fetch;
  }

  describe('canVerify', () => {
    it('engages when the claim contains a URL', () => {
      expect(adapter.canVerify('the whitepaper at https://scamcoin.io/wp said X', [])).toBe(true);
    });

    it('engages when an entity is a bare domain', () => {
      expect(adapter.canVerify('this project is legit', ['rugpull.finance'])).toBe(true);
    });

    it('does NOT engage without a URL/domain', () => {
      expect(adapter.canVerify('the earth is flat', ['earth', 'science'])).toBe(false);
    });

    it('ignores code-file-like tokens (foo.ts) as domains', () => {
      expect(adapter.canVerify('see index.ts and main.py', [])).toBe(false);
    });
  });

  describe('fetchEvidence', () => {
    it('dates the origin from the earliest capture', async () => {
      mockCdx([
        ['20090131115053', 'http://bitcoin.org:80/', '200'],
        ['20150101000000', 'http://bitcoin.org/', '200'],
        ['20240101000000', 'https://bitcoin.org/', '200'],
      ]);

      const ev = await adapter.fetchEvidence({
        claim: 'bitcoin.org launched recently',
        entities: [],
      });

      expect(ev).toHaveLength(1);
      expect(ev[0]!.source).toContain('bitcoin.org');
      expect(ev[0]!.data['firstCapture']).toBe('2009-01-31T11:50:53.000Z');
      expect(ev[0]!.data['captureCount']).toBe(3);
      expect(ev[0]!.excerpt).toContain('2009-01-31');
      expect(ev[0]!.url).toContain('web.archive.org/web/20090131115053');
    });

    it('handles a single capture', async () => {
      mockCdx([['20200601120000', 'https://new-site.com/', '200']]);
      const ev = await adapter.fetchEvidence({ claim: '', entities: ['new-site.com'] });
      expect(ev[0]!.excerpt).toContain('Archived once');
      expect(ev[0]!.data['captureCount']).toBe(1);
    });

    it('returns [] when a target has no captures', async () => {
      mockCdx([]);
      const ev = await adapter.fetchEvidence({ claim: '', entities: ['never-archived.xyz'] });
      expect(ev).toEqual([]);
    });

    it('degrades to [] on network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch;
      const ev = await adapter.fetchEvidence({ claim: 'https://x.com', entities: [] });
      expect(ev).toEqual([]);
    });
  });
});
