import { describe, expect, it } from 'vitest';

import { parseBoolean, parseCsvList, parseNodeEnv, parsePositiveInteger } from './env.js';

describe('parseNodeEnv', () => {
  it('rejects invalid NODE_ENV values', () => {
    expect(() => parseNodeEnv('banana')).toThrow('Invalid NODE_ENV value: banana');
  });
});

describe('parseBoolean', () => {
  it('parses explicit boolean values and uses the fallback when omitted', () => {
    expect(parseBoolean('true', false)).toBe(true);
    expect(parseBoolean('false', true)).toBe(false);
    expect(parseBoolean(undefined, true)).toBe(true);
  });

  it('rejects invalid boolean values', () => {
    expect(() => parseBoolean('yes', false)).toThrow('Invalid boolean value: yes');
  });
});

describe('parsePositiveInteger', () => {
  it('parses explicit values and uses the fallback when omitted', () => {
    expect(parsePositiveInteger('42', 10)).toBe(42);
    expect(parsePositiveInteger(undefined, 10)).toBe(10);
  });

  it('rejects zero, negatives and non-integers', () => {
    expect(() => parsePositiveInteger('0', 10)).toThrow('Invalid positive integer value: 0');
    expect(() => parsePositiveInteger('-1', 10)).toThrow('Invalid positive integer value: -1');
    expect(() => parsePositiveInteger('1.5', 10)).toThrow('Invalid positive integer value: 1.5');
  });
});

describe('parseCsvList', () => {
  it('returns trimmed entries and skips empty fragments', () => {
    expect(parseCsvList(' https://a.example , ,https://b.example ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
    expect(parseCsvList(undefined)).toEqual([]);
  });
});
