import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

export type GatewayRequestStatus = 'success' | 'error' | 'blocked';
export type CircuitBreakerMetricState = 'closed' | 'half_open' | 'open';

const gatewayRequestsTotal = new Counter({
  name: 'gateway_requests_total',
  help: 'Total gateway proxy requests by provider, model, and outcome status',
  labelNames: ['provider', 'model', 'status'] as const,
  registers: [metricsRegistry],
});

const gatewayRequestLatencyMs = new Histogram({
  name: 'gateway_request_latency_ms',
  help: 'Gateway proxy request latency in milliseconds, by provider and model',
  labelNames: ['provider', 'model'] as const,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [metricsRegistry],
});

const circuitBreakerStateGauge = new Gauge({
  name: 'gateway_circuit_breaker_state',
  help: 'Circuit breaker state per (provider, model): 0=closed, 1=half_open, 2=open',
  labelNames: ['provider', 'model'] as const,
  registers: [metricsRegistry],
});

export function recordGatewayRequest(
  provider: string,
  model: string,
  status: GatewayRequestStatus,
  latencyMs: number,
): void {
  gatewayRequestsTotal.labels(provider, model, status).inc();
  gatewayRequestLatencyMs.labels(provider, model).observe(latencyMs);
}

const CIRCUIT_STATE_VALUES: Record<CircuitBreakerMetricState, number> = {
  closed: 0,
  half_open: 1,
  open: 2,
};

export function recordCircuitBreakerState(provider: string, model: string, state: CircuitBreakerMetricState): void {
  circuitBreakerStateGauge.labels(provider, model).set(CIRCUIT_STATE_VALUES[state]);
}
