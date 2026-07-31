import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey } from './api-key.util';

describe('generateApiKey', () => {
  it('prefixes live keys with sk-mg-live-', () => {
    const key = generateApiKey('live');
    expect(key.plaintext.startsWith('sk-mg-live-')).toBe(true);
  });

  it('prefixes test keys with sk-mg-test-', () => {
    const key = generateApiKey('test');
    expect(key.plaintext.startsWith('sk-mg-test-')).toBe(true);
  });

  it('produces a keyPrefix that is a substring of the plaintext', () => {
    const key = generateApiKey('live');
    expect(key.plaintext.startsWith(key.keyPrefix)).toBe(true);
    expect(key.keyPrefix.length).toBeLessThan(key.plaintext.length);
  });

  it('hashes deterministically and does not leak the plaintext', () => {
    const key = generateApiKey('test');
    expect(key.keyHash).toBe(hashApiKey(key.plaintext));
    expect(key.keyHash).not.toContain(key.plaintext);
  });

  it('generates unique plaintexts across calls', () => {
    const a = generateApiKey('live');
    const b = generateApiKey('live');
    expect(a.plaintext).not.toBe(b.plaintext);
  });
});
