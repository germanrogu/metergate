import { describe, expect, it } from 'vitest';
import { metricsRegistry, recordCircuitBreakerState, recordGatewayRequest } from './metrics';

describe('metrics', () => {
  it('increments the requests counter and exposes it with labels', async () => {
    recordGatewayRequest('openai', 'gpt-4o-mini', 'success', 42);

    const output = await metricsRegistry.metrics();

    expect(output).toContain('gateway_requests_total');
    expect(output).toContain('provider="openai"');
    expect(output).toContain('model="gpt-4o-mini"');
    expect(output).toContain('status="success"');
  });

  it('records request latency in the histogram', async () => {
    recordGatewayRequest('anthropic', 'claude-3-5-haiku-latest', 'error', 250);

    const output = await metricsRegistry.metrics();

    expect(output).toContain('gateway_request_latency_ms');
  });

  it('sets the circuit breaker gauge to the numeric value for each state', async () => {
    recordCircuitBreakerState('anthropic', 'claude-3-5-sonnet-latest', 'open');

    const output = await metricsRegistry.metrics();

    expect(output).toMatch(
      /gateway_circuit_breaker_state\{provider="anthropic",model="claude-3-5-sonnet-latest"\} 2/,
    );
  });
});
