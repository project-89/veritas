import { ConfigService } from '@nestjs/config';
import { ClaimVerificationService } from './claim-verification.service';
import type { ExtractedClaim } from './propaganda.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfigService(geminiKey?: string): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'GEMINI_API_KEY') return geminiKey;
      return undefined;
    },
  } as unknown as ConfigService;
}

function makeClaim(overrides: Partial<ExtractedClaim> = {}): ExtractedClaim {
  return {
    claim: overrides.claim ?? 'The Earth orbits the Sun',
    type: overrides.type ?? 'factual',
    sources: overrides.sources ?? ['@user1'],
    firstSeen: overrides.firstSeen ?? '2025-01-01T00:00:00Z',
    frequency: overrides.frequency ?? 5,
    verifiability: overrides.verifiability ?? 'verifiable',
  };
}

// Minimal Wikipedia API response
function wikiResponse(results: Array<{ title: string; snippet: string }>) {
  return {
    query: {
      search: results.map((r, i) => ({
        title: r.title,
        snippet: r.snippet,
        pageid: 1000 + i,
      })),
    },
  };
}

// Minimal GDELT API response
function gdeltResponse(articles: Array<{ title: string; url?: string; domain?: string }>) {
  return {
    articles: articles.map((a) => ({
      title: a.title,
      url: a.url ?? `https://example.com/${a.title.replace(/ /g, '-')}`,
      domain: a.domain ?? 'example.com',
    })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaimVerificationService', () => {
  let service: ClaimVerificationService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    // Create service without Gemini key (heuristic mode)
    service = new ClaimVerificationService(makeConfigService());

    // Mock global fetch
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // Filter non-verifiable claims
  // -------------------------------------------------------------------------

  it('should skip non-verifiable claims', async () => {
    const claims: ExtractedClaim[] = [
      makeClaim({ claim: 'Freedom is important', verifiability: 'subjective' }),
      makeClaim({
        claim: 'The future will be better',
        verifiability: 'unfalsifiable',
      }),
    ];

    const result = await service.verifyBatch(claims);

    expect(result.results).toHaveLength(0);
    expect(result.verifiedCount).toBe(0);
    expect(result.disputedCount).toBe(0);
    expect(result.unverifiedCount).toBe(0);
    expect(result.summary).toContain('No verifiable claims');
  });

  // -------------------------------------------------------------------------
  // Claim with supporting evidence
  // -------------------------------------------------------------------------

  it('should find supporting evidence from Wikipedia and GDELT', async () => {
    const claim = makeClaim({
      claim: 'The Earth orbits the Sun',
    });

    fetchSpy.mockImplementation((url: string | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('wikipedia.org')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              wikiResponse([
                {
                  title: "Earth's orbit",
                  snippet:
                    'The <span class="searchmatch">Earth</span> completes one <span class="searchmatch">orbit</span> around the <span class="searchmatch">Sun</span> every 365.25 days.',
                },
                {
                  title: 'Heliocentrism',
                  snippet:
                    'Heliocentrism is the model where the Earth and planets revolve around the Sun.',
                },
              ]),
            ),
        });
      }

      if (urlStr.includes('gdeltproject.org')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              gdeltResponse([
                {
                  title: 'Earth orbit around Sun confirmed by NASA measurements',
                  domain: 'nasa.gov',
                },
              ]),
            ),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await service.verifyBatch([claim]);

    expect(result.results).toHaveLength(1);
    const first = result.results[0]!;
    expect(first.evidence.supporting.length).toBeGreaterThan(0);
    expect(first.sourcesChecked).toContain('Wikipedia');
    expect(first.sourcesChecked).toContain('GDELT Global News');
  });

  // -------------------------------------------------------------------------
  // Claim with no evidence
  // -------------------------------------------------------------------------

  it('should handle claim with no evidence found', async () => {
    const claim = makeClaim({
      claim: 'Zorbglax invented the flibbertigibbet in 2025',
    });

    fetchSpy.mockImplementation((url: string | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('wikipedia.org')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(wikiResponse([])),
        });
      }

      if (urlStr.includes('gdeltproject.org')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(gdeltResponse([])),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await service.verifyBatch([claim]);

    expect(result.results).toHaveLength(1);
    const first = result.results[0]!;
    expect(first.status).toBe('unverified');
    expect(first.evidence.supporting).toHaveLength(0);
    expect(first.evidence.contradicting).toHaveLength(0);
    expect(result.unverifiedCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Wikipedia API parsing
  // -------------------------------------------------------------------------

  it('should correctly parse Wikipedia search results', async () => {
    await service.searchWikipedia('climate change');

    // We mock fetch below, so let's test the actual parsing logic
    fetchSpy.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(
            wikiResponse([
              {
                title: 'Climate change',
                snippet:
                  '<span class="searchmatch">Climate</span> <span class="searchmatch">change</span> refers to long-term shifts in temperatures.',
              },
            ]),
          ),
      }),
    );

    const result = await service.searchWikipedia('climate change');
    expect(result).toHaveLength(1);
    const group = result[0]!;
    expect(group.source).toBe('Wikipedia');
    expect(group.items).toHaveLength(1);
    expect(group.items[0]!.title).toBe('Climate change');
  });

  // -------------------------------------------------------------------------
  // Graceful handling of API failures
  // -------------------------------------------------------------------------

  it('should handle Wikipedia API failure gracefully', async () => {
    fetchSpy.mockImplementation((url: string | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('wikipedia.org')) {
        return Promise.reject(new Error('Network error'));
      }

      if (urlStr.includes('gdeltproject.org')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(gdeltResponse([])),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    const claim = makeClaim({ claim: 'Test claim for error handling' });
    const result = await service.verifyBatch([claim]);

    // Should not throw, should return unverified
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.status).toBe('unverified');
  });

  it('should handle GDELT API failure gracefully', async () => {
    fetchSpy.mockImplementation((url: string | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('wikipedia.org')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(wikiResponse([])),
        });
      }

      if (urlStr.includes('gdeltproject.org')) {
        return Promise.resolve({ ok: false, status: 500 });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    const claim = makeClaim({ claim: 'Test claim for GDELT error' });
    const result = await service.verifyBatch([claim]);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.status).toBe('unverified');
  });

  it('should handle both APIs failing gracefully', async () => {
    fetchSpy.mockImplementation(() => Promise.reject(new Error('Network error')));

    const claim = makeClaim({ claim: 'Test claim for total failure' });
    const result = await service.verifyBatch([claim]);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.status).toBe('unverified');
    expect(result.results[0]!.confidence).toBeLessThanOrEqual(0.1);
  });

  // -------------------------------------------------------------------------
  // Heuristic verification logic
  // -------------------------------------------------------------------------

  it('should use heuristic when no Gemini key is set', async () => {
    const claim = makeClaim({
      claim: 'The Earth orbits around the Sun',
    });

    fetchSpy.mockImplementation((url: string | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('wikipedia.org')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              wikiResponse([
                {
                  title: "Earth's orbit",
                  snippet: 'The Earth orbits the Sun at a distance of about 150 million km.',
                },
                {
                  title: 'Orbital mechanics',
                  snippet: 'Earth orbit around Sun follows Kepler laws of planetary motion.',
                },
              ]),
            ),
        });
      }

      if (urlStr.includes('gdeltproject.org')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              gdeltResponse([
                { title: 'Earth orbit Sun distance measured precisely', domain: 'science.org' },
              ]),
            ),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await service.verifyBatch([claim]);

    expect(result.results).toHaveLength(1);
    const first = result.results[0]!;
    // With supporting evidence from Wikipedia and GDELT, heuristic should find support
    expect(first.evidence.supporting.length).toBeGreaterThan(0);
    expect(first.reasoning.toLowerCase()).toContain('heuristic');
    // Caveats should mention heuristic
    expect(first.caveats.some((c) => c.toLowerCase().includes('heuristic'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Helper methods
  // -------------------------------------------------------------------------

  it('should extract meaningful search terms from claims', () => {
    const terms = service.extractSearchTerms(
      'The president of the United States visited France in 2024',
    );
    // Should strip stop words like "the", "of", "in"
    expect(terms).not.toContain(' the ');
    expect(terms.length).toBeGreaterThan(0);
  });

  it('should strip HTML from Wikipedia snippets', () => {
    const result = service.stripHtml(
      '<span class="searchmatch">Climate</span> <span class="searchmatch">change</span> refers to &amp; shifts.',
    );
    expect(result).not.toContain('<span');
    expect(result).not.toContain('</span>');
    expect(result).toContain('Climate');
    expect(result).toContain('change');
  });

  // -------------------------------------------------------------------------
  // Batch summary
  // -------------------------------------------------------------------------

  it('should generate a meaningful batch summary', async () => {
    const claims: ExtractedClaim[] = [
      makeClaim({ claim: 'Verifiable claim A', verifiability: 'verifiable' }),
      makeClaim({ claim: 'Subjective claim B', verifiability: 'subjective' }),
    ];

    fetchSpy.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(wikiResponse([])),
      }),
    );

    const result = await service.verifyBatch(claims);

    expect(result.summary).toContain('1 verifiable claim');
    expect(result.summary).toContain('1 non-verifiable');
    expect(result.summary).toContain('preliminary');
  });

  // -------------------------------------------------------------------------
  // Mixed verifiable + non-verifiable batch
  // -------------------------------------------------------------------------

  it('should process mixed batch correctly', async () => {
    const claims: ExtractedClaim[] = [
      makeClaim({
        claim: 'The population of Tokyo exceeds 13 million',
        verifiability: 'verifiable',
      }),
      makeClaim({
        claim: 'Democracy is the best system',
        verifiability: 'subjective',
      }),
      makeClaim({
        claim: 'A god exists somewhere',
        verifiability: 'unfalsifiable',
      }),
      makeClaim({
        claim: 'The Olympics were held in Paris in 2024',
        verifiability: 'verifiable',
      }),
    ];

    fetchSpy.mockImplementation((url: string | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      if (urlStr.includes('wikipedia.org')) {
        if (urlStr.includes('Tokyo') || urlStr.includes('population')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve(
                wikiResponse([
                  {
                    title: 'Tokyo',
                    snippet: 'Tokyo has a population of over 13 million in the city proper.',
                  },
                  {
                    title: 'Demographics of Tokyo',
                    snippet: 'The population of Tokyo exceeded 13 million residents.',
                  },
                ]),
              ),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve(
              wikiResponse([
                {
                  title: '2024 Summer Olympics',
                  snippet: 'The 2024 Summer Olympics were held in Paris, France.',
                },
              ]),
            ),
        });
      }

      if (urlStr.includes('gdeltproject.org')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(gdeltResponse([])),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    const result = await service.verifyBatch(claims);

    // Should only process the 2 verifiable claims
    expect(result.results).toHaveLength(2);
    expect(result.summary).toContain('2 verifiable');
    expect(result.summary).toContain('2 non-verifiable');
  });
});
