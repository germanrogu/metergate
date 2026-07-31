export type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitEntry {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  cooldownMs: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = { failureThreshold: 5, cooldownMs: 30_000 };

// One breaker per (provider, model), in-memory and single-instance —
// tracking consecutive failures across requests only works if the
// state actually persists between them, so this is intentionally a
// long-lived singleton, not something constructed per-request. A
// multi-instance deployment would need this backed by Redis (shared
// state, atomic transitions); not built here, documented instead of
// silently assumed away.
export class CircuitBreaker {
  private readonly entries = new Map<string, CircuitEntry>();

  constructor(private readonly options: CircuitBreakerOptions = DEFAULT_OPTIONS) {}

  canProceed(key: string): boolean {
    const entry = this.getEntry(key);

    if (entry.state === 'closed') {
      return true;
    }

    if (entry.state === 'open') {
      const openedAt = entry.openedAt ?? 0;
      if (Date.now() - openedAt >= this.options.cooldownMs) {
        entry.state = 'half_open';
        return true;
      }
      return false;
    }

    // half_open: let the trial call through. Concurrent requests could
    // both slip through here — acceptable for a single demo instance,
    // would need an atomic claim (e.g. a Redis Lua script) otherwise.
    return true;
  }

  recordSuccess(key: string): void {
    this.entries.set(key, { state: 'closed', consecutiveFailures: 0, openedAt: null });
  }

  recordFailure(key: string): void {
    const entry = this.getEntry(key);
    const consecutiveFailures = entry.consecutiveFailures + 1;

    if (entry.state === 'half_open' || consecutiveFailures >= this.options.failureThreshold) {
      this.entries.set(key, { state: 'open', consecutiveFailures, openedAt: Date.now() });
      return;
    }

    this.entries.set(key, { state: 'closed', consecutiveFailures, openedAt: null });
  }

  getState(key: string): CircuitState {
    return this.getEntry(key).state;
  }

  private getEntry(key: string): CircuitEntry {
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { state: 'closed', consecutiveFailures: 0, openedAt: null };
      this.entries.set(key, entry);
    }
    return entry;
  }
}

export function circuitKey(provider: string, model: string): string {
  return `${provider}:${model}`;
}

// Shared across the process on purpose — a fresh instance per request
// would defeat the entire point of tracking consecutive failures.
export const gatewayCircuitBreaker = new CircuitBreaker();
