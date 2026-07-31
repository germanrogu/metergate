import { fetchWithTimeout } from '../providers/fetch-with-timeout';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const DEFAULT_TIMEOUT_MS = 15_000;

export class StripeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'StripeApiError';
  }
}

export interface StripeCustomer {
  id: string;
}

export interface CreateCustomerParams {
  name: string;
  metadata: Record<string, string>;
}

export interface ReportMeterEventParams {
  eventName: string;
  stripeCustomerId: string;
  value: number;
  identifier: string;
}

export interface MeterEventResult {
  identifier: string;
}

// Stripe's REST API is form-encoded (application/x-www-form-urlencoded),
// not JSON — nested fields use bracket notation (metadata[key]=value).
// No official SDK dependency, same reasoning as the OpenAI/Anthropic
// adapters: a thin wrapper over the documented HTTP contract is enough,
// and keeps this testable against mocked fetch without a live account.
export class StripeClient {
  constructor(
    private readonly secretKey: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async createCustomer(params: CreateCustomerParams): Promise<StripeCustomer> {
    const fields: Record<string, string> = { name: params.name };
    for (const [key, value] of Object.entries(params.metadata)) {
      fields[`metadata[${key}]`] = value;
    }
    return this.request<StripeCustomer>('POST', '/customers', fields);
  }

  // https://docs.stripe.com/api/billing/meter-event/create
  async reportMeterEvent(params: ReportMeterEventParams): Promise<MeterEventResult> {
    return this.request<MeterEventResult>('POST', '/billing/meter_events', {
      event_name: params.eventName,
      'payload[stripe_customer_id]': params.stripeCustomerId,
      'payload[value]': String(params.value),
      identifier: params.identifier,
    });
  }

  private async request<T>(method: string, path: string, fields: Record<string, string>): Promise<T> {
    const response = await fetchWithTimeout(
      `${STRIPE_API_BASE}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(fields).toString(),
      },
      this.timeoutMs,
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new StripeApiError(`Stripe API error (${response.status}): ${errorBody}`, response.status);
    }

    return (await response.json()) as T;
  }
}
