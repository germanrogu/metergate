import { describe, expect, it } from 'vitest';
import {
  signStripeWebhookPayload,
  StripeWebhookSignatureError,
  verifyStripeWebhookSignature,
} from './stripe-webhook-signature';

const SECRET = 'whsec_test_secret';
const PAYLOAD = JSON.stringify({ id: 'evt_test', type: 'invoice.created' });

describe('verifyStripeWebhookSignature', () => {
  it('accepts a correctly signed payload', () => {
    const now = Math.floor(Date.now() / 1000);
    const header = signStripeWebhookPayload(PAYLOAD, SECRET, now);

    expect(() => verifyStripeWebhookSignature(PAYLOAD, header, SECRET)).not.toThrow();
  });

  it('rejects a payload that was tampered with after signing', () => {
    const now = Math.floor(Date.now() / 1000);
    const header = signStripeWebhookPayload(PAYLOAD, SECRET, now);
    const tamperedPayload = JSON.stringify({ id: 'evt_test', type: 'invoice.payment_failed' });

    expect(() => verifyStripeWebhookSignature(tamperedPayload, header, SECRET)).toThrow(
      StripeWebhookSignatureError,
    );
  });

  it('rejects a signature produced with the wrong secret', () => {
    const now = Math.floor(Date.now() / 1000);
    const header = signStripeWebhookPayload(PAYLOAD, 'whsec_a_different_secret', now);

    expect(() => verifyStripeWebhookSignature(PAYLOAD, header, SECRET)).toThrow(StripeWebhookSignatureError);
  });

  it('rejects a timestamp outside the tolerance window', () => {
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const header = signStripeWebhookPayload(PAYLOAD, SECRET, tenMinutesAgo);

    expect(() => verifyStripeWebhookSignature(PAYLOAD, header, SECRET)).toThrow(StripeWebhookSignatureError);
  });

  it('rejects a malformed signature header', () => {
    expect(() => verifyStripeWebhookSignature(PAYLOAD, 'not-a-real-header', SECRET)).toThrow(
      StripeWebhookSignatureError,
    );
  });
});
