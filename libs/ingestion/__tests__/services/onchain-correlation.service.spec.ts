import { OnChainCorrelationService } from '../../src/lib/services/onchain-correlation.service';

describe('OnChainCorrelationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns unavailable when no API key is configured', async () => {
    const service = new OnChainCorrelationService(
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );

    const result = await service.buildSummary(['0x1234567890abcdef1234567890abcdef12345678']);

    expect(result.status).toBe('unavailable');
    expect(result.note).toContain('ETHERSCAN_API_KEY');
  });

  it('builds address and common counterparty summaries from Etherscan responses', async () => {
    const responses = [
      {
        ok: true,
        json: async () => ({
          status: '1',
          message: 'OK',
          result: [
            { from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', to: '0xcccccccccccccccccccccccccccccccccccccccc' },
            { from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', to: '0xdddddddddddddddddddddddddddddddddddddddd' },
          ],
        }),
      },
      {
        ok: true,
        json: async () => ({
          status: '1',
          message: 'OK',
          result: [
            {
              from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              to: '0xcccccccccccccccccccccccccccccccccccccccc',
              contractAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
              tokenSymbol: 'RXS',
            },
          ],
        }),
      },
      {
        ok: true,
        json: async () => ({
          status: '1',
          message: 'OK',
          result: [
            { from: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', to: '0xcccccccccccccccccccccccccccccccccccccccc' },
          ],
        }),
      },
      {
        ok: true,
        json: async () => ({
          status: '1',
          message: 'OK',
          result: [
            {
              from: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              to: '0xcccccccccccccccccccccccccccccccccccccccc',
              contractAddress: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
              tokenSymbol: 'RXS',
            },
          ],
        }),
      },
    ];

    const fetchMock = jest.fn().mockImplementation(async () => responses.shift());
    const service = new OnChainCorrelationService(
      { get: jest.fn().mockReturnValue('key') } as any,
    );
    service.setFetchImplementation(fetchMock as any);

    const result = await service.buildSummary([
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ]);

    expect(result.status).toBe('ready');
    expect(result.addressSummaries).toHaveLength(2);
    expect(result.commonCounterparties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          address: '0xcccccccccccccccccccccccccccccccccccccccc',
          addressCount: 2,
        }),
      ]),
    );
    expect(result.tokenContracts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          symbol: 'RXS',
        }),
      ]),
    );
  });
});
