import { parseTokenResponse } from './acled.adapter';

describe('parseTokenResponse', () => {
  it('parses an OAuth token grant with the documented fields', () => {
    const p = parseTokenResponse(
      {
        token_type: 'Bearer',
        expires_in: 86400,
        access_token: 'ACC',
        refresh_token: 'REF',
      },
      1_000_000,
    );
    expect(p?.accessToken).toBe('ACC');
    expect(p?.refreshToken).toBe('REF');
    expect(p?.accessTokenExpiry).toBe(1_000_000 + 86400 * 1000);
    // refresh token documented at 14 days
    expect(p?.refreshTokenExpiry).toBe(1_000_000 + 14 * 24 * 60 * 60 * 1000);
  });

  it('defaults expiry to 24h when expires_in is absent', () => {
    const p = parseTokenResponse({ access_token: 'ACC' }, 0);
    expect(p?.accessTokenExpiry).toBe(86400 * 1000);
    expect(p?.refreshToken).toBeNull();
  });

  it('returns null without an access token', () => {
    expect(parseTokenResponse({ token_type: 'Bearer' }, 0)).toBeNull();
  });
});
