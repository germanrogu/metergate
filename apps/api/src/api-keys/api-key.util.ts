import { createHash, randomBytes } from 'node:crypto';

export type ApiKeyMode = 'live' | 'test';

export interface GeneratedApiKey {
  plaintext: string;
  keyPrefix: string;
  keyHash: string;
}

const PREFIX_VISIBLE_CHARS = 12;

export function generateApiKey(mode: ApiKeyMode): GeneratedApiKey {
  const prefix = mode === 'live' ? 'sk-mg-live-' : 'sk-mg-test-';
  const secret = randomBytes(24).toString('base64url');
  const plaintext = `${prefix}${secret}`;
  return {
    plaintext,
    keyPrefix: plaintext.slice(0, prefix.length + PREFIX_VISIBLE_CHARS),
    keyHash: hashApiKey(plaintext),
  };
}

export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}
