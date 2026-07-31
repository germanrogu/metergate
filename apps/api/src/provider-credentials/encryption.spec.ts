import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptProviderKey, encryptProviderKey } from './encryption';

describe('provider credential encryption', () => {
  const originalKey = process.env['PROVIDER_CREDENTIALS_ENCRYPTION_KEY'];

  beforeEach(() => {
    process.env['PROVIDER_CREDENTIALS_ENCRYPTION_KEY'] = randomBytes(32).toString('base64');
  });

  afterEach(() => {
    process.env['PROVIDER_CREDENTIALS_ENCRYPTION_KEY'] = originalKey;
  });

  it('round-trips a plaintext value', () => {
    const encrypted = encryptProviderKey('sk-live-super-secret');
    expect(decryptProviderKey(encrypted)).toBe('sk-live-super-secret');
  });

  it('produces different ciphertext for the same plaintext each time', () => {
    const a = encryptProviderKey('same-plaintext');
    const b = encryptProviderKey('same-plaintext');
    expect(a).not.toBe(b);
  });

  it('throws if the ciphertext has been tampered with', () => {
    const encrypted = encryptProviderKey('sk-live-super-secret');
    const raw = Buffer.from(encrypted, 'base64');
    raw[raw.length - 1] = (raw[raw.length - 1]! + 1) % 256;
    const tampered = raw.toString('base64');

    expect(() => decryptProviderKey(tampered)).toThrow();
  });

  it('throws if the encryption key is missing', () => {
    delete process.env['PROVIDER_CREDENTIALS_ENCRYPTION_KEY'];
    expect(() => encryptProviderKey('anything')).toThrow('PROVIDER_CREDENTIALS_ENCRYPTION_KEY is not set');
  });
});
