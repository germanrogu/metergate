import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TOLERANCE_SECONDS = 300;

export class StripeWebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeWebhookSignatureError';
  }
}

interface ParsedSignatureHeader {
  timestamp: number;
  signatures: string[];
}

function parseSignatureHeader(header: string): ParsedSignatureHeader {
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=');
    if (key === 't' && value) {
      timestamp = Number(value);
    } else if (key === 'v1' && value) {
      signatures.push(value);
    }
  }

  if (timestamp === null || Number.isNaN(timestamp) || signatures.length === 0) {
    throw new StripeWebhookSignatureError('Malformed Stripe-Signature header');
  }

  return { timestamp, signatures };
}

// Implements Stripe's documented webhook verification algorithm:
// https://docs.stripe.com/webhooks#verify-manually — signed payload is
// "{timestamp}.{rawBody}", HMAC-SHA256'd with the webhook secret, and
// compared against the v1 signature(s) in the header in constant time.
// Doesn't depend on a live Stripe account: it's pure crypto over a
// documented, stable contract, so it's fully testable with a
// self-generated signature.
export function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string,
  webhookSecret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): void {
  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    throw new StripeWebhookSignatureError('Webhook timestamp is outside the allowed tolerance');
  }

  const signedPayload = `${timestamp}.${payload}`;
  const expected = Buffer.from(createHmac('sha256', webhookSecret).update(signedPayload).digest('hex'), 'hex');

  const matches = signatures.some((signature) => {
    const candidate = Buffer.from(signature, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });

  if (!matches) {
    throw new StripeWebhookSignatureError('No matching signature found');
  }
}

// Test-only helper mirroring what the Stripe CLI / Stripe's servers do
// when signing a webhook — used so tests can produce a header the
// verifier above will accept, without ever calling Stripe.
export function signStripeWebhookPayload(payload: string, webhookSecret: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}
