import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const encoded = process.env['PROVIDER_CREDENTIALS_ENCRYPTION_KEY'];
  if (!encoded) {
    throw new Error('PROVIDER_CREDENTIALS_ENCRYPTION_KEY is not set');
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`PROVIDER_CREDENTIALS_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH} bytes`);
  }
  return key;
}

// Storage format is iv || authTag || ciphertext, base64-encoded as one
// blob — nothing needs to be stored in separate columns.
export function encryptProviderKey(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptProviderKey(encrypted: string): string {
  const raw = Buffer.from(encrypted, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
