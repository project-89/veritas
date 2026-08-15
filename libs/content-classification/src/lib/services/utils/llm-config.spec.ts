import { extractFirstJsonObject, parseLlmJsonArray, parseLlmJsonObject } from './llm-config';

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

describe('parseLlmJsonObject', () => {
  it('parses a well-formed object', () => {
    expect(parseLlmJsonObject('{"a": 1}')).toEqual({ a: 1 });
  });

  it('repairs a missing closing brace', () => {
    // Real gemini-3.5-flash response shape, finishReason STOP:
    // the outer object was never closed.
    const raw = '{\n "stances": [\n  {"stance":"favor","confidence":0.9},\n  {"stance":"against","confidence":0.99}\n ]';
    expect(parseLlmJsonObject(raw)).toEqual({
      stances: [
        { stance: 'favor', confidence: 0.9 },
        { stance: 'against', confidence: 0.99 },
      ],
    });
  });

  it('ignores an extra trailing brace', () => {
    expect(parseLlmJsonObject('{"a": 1}}')).toEqual({ a: 1 });
  });

  it('ignores reasoning text appended after the object', () => {
    expect(parseLlmJsonObject('{"a": 1}\nThe reasoning here is...')).toEqual({ a: 1 });
  });

  it('is not fooled by braces inside strings', () => {
    expect(parseLlmJsonObject('{"a": "}{ not structural"}')).toEqual({ a: '}{ not structural' });
  });

  it('repairs a truncated nested structure', () => {
    expect(parseLlmJsonObject('{"a": {"b": [1, 2')).toEqual({ a: { b: [1, 2] } });
  });

  it('returns null when there is no object at all', () => {
    expect(parseLlmJsonObject('no json here')).toBeNull();
  });

  it('returns null rather than guessing on unsalvageable input', () => {
    expect(parseLlmJsonObject('{"a": ')).toBeNull();
  });
});

describe('parseLlmJsonArray', () => {
  it('parses a well-formed array', () => {
    expect(parseLlmJsonArray('["a", "b"]')).toEqual(['a', 'b']);
  });

  it('does not span to a bracket in appended reasoning', () => {
    // The greedy /\[[\s\S]*\]/ this replaces would match through to the last
    // ']' and fail to parse, dropping every summary.
    expect(parseLlmJsonArray('["a", "b"]\nI chose these because [see above]')).toEqual(['a', 'b']);
  });

  it('repairs a truncated array', () => {
    expect(parseLlmJsonArray('["a", "b"')).toEqual(['a', 'b']);
  });

  it('drops a half-written trailing element rather than failing', () => {
    expect(parseLlmJsonArray('["a", "b", "unfinis')).toEqual(['a', 'b']);
  });

  it('is not fooled by brackets inside strings', () => {
    expect(parseLlmJsonArray('["a ] b", "c"]')).toEqual(['a ] b', 'c']);
  });

  it('returns null when there is no array', () => {
    expect(parseLlmJsonArray('{"a": 1}')).toBeNull();
  });
});

describe('first-complete-structure semantics', () => {
  it('object parser stops at the first complete object', () => {
    expect(parseLlmJsonObject('{"a": 1}\n{"b": 2}')).toEqual({ a: 1 });
  });

  it('array parser stops at the first complete array', () => {
    expect(parseLlmJsonArray('["a"]\n["b"]')).toEqual(['a']);
  });
});
