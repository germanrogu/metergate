import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker, circuitKey } from './circuit-breaker';

describe('CircuitBreaker', () => {
  const KEY = circuitKey('openai', 'gpt-4o-mini');

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts closed and allows calls', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    expect(breaker.getState(KEY)).toBe('closed');
    expect(breaker.canProceed(KEY)).toBe(true);
  });

  it('stays closed below the failure threshold', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    breaker.recordFailure(KEY);
    breaker.recordFailure(KEY);
    expect(breaker.getState(KEY)).toBe('closed');
    expect(breaker.canProceed(KEY)).toBe(true);
  });

  it('opens after reaching the failure threshold and blocks calls', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    breaker.recordFailure(KEY);
    breaker.recordFailure(KEY);
    breaker.recordFailure(KEY);

    expect(breaker.getState(KEY)).toBe('open');
    expect(breaker.canProceed(KEY)).toBe(false);
  });

  it('a success resets the failure count and keeps it closed', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    breaker.recordFailure(KEY);
    breaker.recordFailure(KEY);
    breaker.recordSuccess(KEY);
    breaker.recordFailure(KEY);
    breaker.recordFailure(KEY);

    expect(breaker.getState(KEY)).toBe('closed');
  });

  it('transitions to half-open after the cooldown and allows one trial call', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    breaker.recordFailure(KEY);
    expect(breaker.canProceed(KEY)).toBe(false);

    vi.advanceTimersByTime(1000);

    expect(breaker.canProceed(KEY)).toBe(true);
    expect(breaker.getState(KEY)).toBe('half_open');
  });

  it('closes the circuit when the half-open trial succeeds', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    breaker.recordFailure(KEY);
    vi.advanceTimersByTime(1000);
    breaker.canProceed(KEY);

    breaker.recordSuccess(KEY);

    expect(breaker.getState(KEY)).toBe('closed');
    expect(breaker.canProceed(KEY)).toBe(true);
  });

  it('reopens immediately if the half-open trial fails', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    breaker.recordFailure(KEY);
    vi.advanceTimersByTime(1000);
    breaker.canProceed(KEY);

    breaker.recordFailure(KEY);

    expect(breaker.getState(KEY)).toBe('open');
    expect(breaker.canProceed(KEY)).toBe(false);
  });

  it('tracks separate state per key', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    breaker.recordFailure(circuitKey('openai', 'gpt-4o-mini'));

    expect(breaker.getState(circuitKey('openai', 'gpt-4o-mini'))).toBe('open');
    expect(breaker.getState(circuitKey('anthropic', 'claude-3-5-haiku-latest'))).toBe('closed');
  });
});
