import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantContext {
  tenantId: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(tenantId: string, fn: () => T): T {
  return storage.run({ tenantId }, fn);
}

export function getTenantId(): string {
  const context = storage.getStore();
  if (!context) {
    throw new Error('getTenantId() called outside of a tenant context');
  }
  return context.tenantId;
}

export function getTenantIdOrNull(): string | null {
  return storage.getStore()?.tenantId ?? null;
}
