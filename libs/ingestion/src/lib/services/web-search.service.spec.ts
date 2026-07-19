import { decodeDuckDuckGoUrl, parseDuckDuckGoHtml } from './web-search.service';

describe('decodeDuckDuckGoUrl', () => {
  it('decodes the uddg redirect parameter', () => {
    expect(
      decodeDuckDuckGoUrl(
        '//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fstory%3Fid%3D1&rut=abc',
      ),
    ).toBe('https://example.com/story?id=1');
  });

  it('passes through plain http(s) links', () => {
    expect(decodeDuckDuckGoUrl('https://example.com/page')).toBe('https://example.com/page');
  });

  it('rejects non-web schemes', () => {
    expect(decodeDuckDuckGoUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('parseDuckDuckGoHtml', () => {
  const html = `
    <div class="result">
      <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnews.example%2Fa">Gemini <b>fails</b> at maths</a>
      <a class="result__snippet" href="#">Users report the model &amp;quot;confidently&amp;quot; wrong &#x27;answers&#x27;.</a>
    </div>
    <div class="result">
      <a rel="nofollow" class="result__a" href="https://blog.example/b">Second result title</a>
      <a class="result__snippet" href="#">Second snippet</a>
    </div>
  `;

  it('extracts titles, decoded urls, and snippets in order', () => {
    const results = parseDuckDuckGoHtml(html, 10);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      title: 'Gemini fails at maths',
      url: 'https://news.example/a',
      provider: 'duckduckgo',
    });
    expect(results[1]?.url).toBe('https://blog.example/b');
  });

  it('respects the limit', () => {
    expect(parseDuckDuckGoHtml(html, 1)).toHaveLength(1);
  });

  it('returns [] for markup without results', () => {
    expect(parseDuckDuckGoHtml('<html><body>No results.</body></html>', 5)).toEqual([]);
  });
});
