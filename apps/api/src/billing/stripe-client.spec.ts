import { afterEach, describe, expect, it, vi } from 'vitest';
import { StripeApiError, StripeClient } from './stripe-client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('StripeClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates a customer with form-encoded metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'cus_123' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new StripeClient('sk_test_123');
    const customer = await client.createCustomer({ name: 'Demo Tenant', metadata: { tenant_id: 'tenant-1' } });

    expect(customer).toEqual({ id: 'cus_123' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.stripe.com/v1/customers');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer sk_test_123' });
    const body = new URLSearchParams(init.body as string);
    expect(body.get('name')).toBe('Demo Tenant');
    expect(body.get('metadata[tenant_id]')).toBe('tenant-1');
  });

  it('reports a meter event with the documented payload shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { identifier: 'idem-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new StripeClient('sk_test_123');
    await client.reportMeterEvent({
      eventName: 'gateway_usage',
      stripeCustomerId: 'cus_123',
      value: 42,
      identifier: 'idem-1',
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.stripe.com/v1/billing/meter_events');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('event_name')).toBe('gateway_usage');
    expect(body.get('payload[stripe_customer_id]')).toBe('cus_123');
    expect(body.get('payload[value]')).toBe('42');
    expect(body.get('identifier')).toBe('idem-1');
  });

  it('throws StripeApiError on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad request', { status: 400 })));

    const client = new StripeClient('sk_test_123');

    await expect(client.createCustomer({ name: 'x', metadata: {} })).rejects.toBeInstanceOf(StripeApiError);
  });
});
