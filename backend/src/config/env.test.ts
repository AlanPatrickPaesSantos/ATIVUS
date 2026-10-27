import { describe, expect, it } from 'vitest';

import {
  parseBoolean,
  parseCsvList,
  parseNodeEnv,
  parsePositiveInteger,
  validateProductionConfiguration,
} from './env.js';

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

describe('validateProductionConfiguration', () => {
  it('accepts production with explicit HTTPS origins', () => {
    expect(() => validateProductionConfiguration({
      nodeEnv: 'production',
      allowedOrigins: ['https://ativus-frontend.onrender.com'],
    })).not.toThrow();
  });

  it('rejects production without an allowed origin', () => {
    expect(() => validateProductionConfiguration({
      nodeEnv: 'production',
      allowedOrigins: [],
    })).toThrow('ALLOWED_ORIGINS must contain at least one origin in production');
  });

  it('rejects malformed or wildcard production origins', () => {
    expect(() => validateProductionConfiguration({
      nodeEnv: 'production',
      allowedOrigins: ['*'],
    })).toThrow('ALLOWED_ORIGINS contains an invalid origin');
    expect(() => validateProductionConfiguration({
      nodeEnv: 'production',
      allowedOrigins: ['ativus-frontend.onrender.com'],
    })).toThrow('ALLOWED_ORIGINS contains an invalid origin');
  });

  it('keeps empty origins valid in development and tests', () => {
    expect(() => validateProductionConfiguration({ nodeEnv: 'development', allowedOrigins: [] })).not.toThrow();
    expect(() => validateProductionConfiguration({ nodeEnv: 'test', allowedOrigins: [] })).not.toThrow();
  });
});
