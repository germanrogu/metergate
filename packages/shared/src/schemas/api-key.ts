import { z } from 'zod';
import { providerSchema } from './usage-event';

export const createApiKeyRequestSchema = z.object({
  label: z.string().min(1).max(120),
  scopes: z.array(providerSchema).min(1),
});
export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;

// The plaintext key is only ever returned once, at creation time.
export const createApiKeyResponseSchema = z.object({
  id: z.string().uuid(),
  keyPrefix: z.string(),
  plaintextKey: z.string(),
  createdAt: z.string().datetime(),
});
export type CreateApiKeyResponse = z.infer<typeof createApiKeyResponseSchema>;
