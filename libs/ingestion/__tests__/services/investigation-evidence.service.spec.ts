import { InvestigationEvidenceService } from '../../src/lib/services/investigation-evidence.service';

describe('InvestigationEvidenceService', () => {
  const mockJinaReader = {
    readUrl: jest.fn(),
  };

  const mockYoutubeConnector = {
    getVideoTranscript: jest.fn(),
  };

  const buildService = () =>
    new InvestigationEvidenceService(
      mockJinaReader as any,
      mockYoutubeConnector as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts and processes YouTube evidence seeds', async () => {
    mockYoutubeConnector.getVideoTranscript.mockResolvedValue(
      'Rexas Finance sends users to 0x1234567890abcdef1234567890abcdef12345678 and rexas.example',
    );

    const service = buildService();
    const result = await service.prepareSeed({
      id: 'seed-1',
      kind: 'youtube',
      value: 'https://www.youtube.com/watch?v=abc123xyz99',
      label: '',
      status: 'pending',
      notes: null,
      metadata: {},
      extractedEntities: [],
      createdAt: new Date('2026-04-06T00:00:00Z'),
      updatedAt: new Date('2026-04-06T00:00:00Z'),
    });

    expect(result.kind).toBe('youtube');
    expect(result.status).toBe('processed');
    expect(result.metadata['videoId']).toBe('abc123xyz99');
    expect(result.metadata['transcriptAvailable']).toBe(true);
    expect(result.extractedEntities).toEqual(
      expect.arrayContaining([
        { type: 'youtube_video', value: 'abc123xyz99' },
        { type: 'address', value: '0x1234567890abcdef1234567890abcdef12345678' },
        { type: 'domain', value: 'rexas.example' },
      ]),
    );
  });

  it('reads article URLs and extracts infrastructure entities', async () => {
    mockJinaReader.readUrl.mockResolvedValue({
      url: 'https://example.com/investigations/rexas',
      title: 'Rexas explainer',
      description: 'Analyst breakdown',
      content: 'See t.me/rexasintel and @NetCrypto for updates from example.com',
    });

    const service = buildService();
    const result = await service.prepareSeed({
      id: 'seed-2',
      kind: 'url',
      value: 'https://example.com/investigations/rexas',
      label: '',
      status: 'pending',
      notes: null,
      metadata: {},
      extractedEntities: [],
      createdAt: new Date('2026-04-06T00:00:00Z'),
      updatedAt: new Date('2026-04-06T00:00:00Z'),
    });

    expect(result.kind).toBe('article');
    expect(result.status).toBe('processed');
    expect(result.label).toBe('Rexas explainer');
    expect(result.metadata['host']).toBe('example.com');
    expect(result.extractedEntities).toEqual(
      expect.arrayContaining([
        { type: 'domain', value: 'example.com' },
        { type: 'telegram', value: 'rexasintel' },
        { type: 'handle', value: '@NetCrypto' },
      ]),
    );
  });

  it('marks the seed as error when external fetch fails but keeps raw extraction', async () => {
    mockJinaReader.readUrl.mockRejectedValue(new Error('timeout'));

    const service = buildService();
    const result = await service.prepareSeed({
      id: 'seed-3',
      kind: 'url',
      value: 'https://project89.example/report',
      label: '',
      status: 'pending',
      notes: 'mirror at project89.example and @project89intel',
      metadata: {},
      extractedEntities: [],
      createdAt: new Date('2026-04-06T00:00:00Z'),
      updatedAt: new Date('2026-04-06T00:00:00Z'),
    });

    expect(result.status).toBe('error');
    expect(result.metadata['error']).toBe('timeout');
    expect(result.extractedEntities).toEqual(
      expect.arrayContaining([
        { type: 'domain', value: 'project89.example' },
        { type: 'handle', value: '@project89intel' },
      ]),
    );
  });
});
