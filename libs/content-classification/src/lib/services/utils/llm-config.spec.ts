import { extractFirstJsonObject } from './llm-config';

describe('extractFirstJsonObject', () => {
  it('extracts a clean JSON object', () => {
    expect(extractFirstJsonObject('{"a":1,"b":"x"}')).toBe('{"a":1,"b":"x"}');
  });

  it('ignores trailing content appended by thinking models', () => {
    const raw = '{"verdict":"false"}\n\nReasoning: the claim is contradicted by sources.';
    expect(extractFirstJsonObject(raw)).toBe('{"verdict":"false"}');
    expect(JSON.parse(extractFirstJsonObject(raw)!)).toEqual({ verdict: 'false' });
  });

  it('ignores leading content (markdown fences, prose)', () => {
    const raw = '```json\n{"ok":true}\n```';
    expect(extractFirstJsonObject(raw)).toBe('{"ok":true}');
  });

  it('handles nested objects', () => {
    const raw = '{"a":{"b":{"c":1}},"d":2} trailing';
    expect(extractFirstJsonObject(raw)).toBe('{"a":{"b":{"c":1}},"d":2}');
  });

  it('does not stop at braces inside strings', () => {
    const raw = '{"text":"a } brace and { another"} tail';
    expect(extractFirstJsonObject(raw)).toBe('{"text":"a } brace and { another"}');
  });

  it('handles escaped quotes inside strings', () => {
    const raw = '{"q":"she said \\"hi\\" }"} extra';
    expect(extractFirstJsonObject(raw)).toBe('{"q":"she said \\"hi\\" }"}');
  });

  it('returns null when there is no object', () => {
    expect(extractFirstJsonObject('no json here')).toBeNull();
    expect(extractFirstJsonObject('{"unterminated": true')).toBeNull();
  });
});
