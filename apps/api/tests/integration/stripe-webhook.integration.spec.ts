import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { getPool } from '../../src/db/pool';
import { runWithTenantContext } from '../../src/middleware/tenant-context';
import { setTenantStripeCustomerId } from '../../src/billing/tenant-billing.repository';
import { signStripeWebhookPayload } from '../../src/billing/stripe-webhook-signature';
import { setupBodyParsers } from '../../src/setup-body-parsers';
import { queryAsMigrator, seedTenant, type SeededTenant } from '../helpers/seed-tenant';

const WEBHOOK_SECRET = 'whsec_test_secret_for_integration';

interface InvoiceRow {
  status: string;
  total_usd_micros: string;
  stripe_invoice_id: string;
}

function stripeInvoiceEvent(type: string, customerId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    type,
    data: {
      object: {
        id: `in_${Math.random().toString(36).slice(2)}`,
        customer: customerId,
        status: 'open',
        total: 1234, // cents
        period_start: Math.floor(Date.now() / 1000) - 86_400,
        period_end: Math.floor(Date.now() / 1000),
        ...overrides,
      },
    },
  };
}

describe('Stripe webhook (integration)', () => {
  let app: INestApplication;
  let tenant: SeededTenant;
  let stripeCustomerId: string;

  beforeAll(async () => {
    process.env['STRIPE_WEBHOOK_SECRET'] = WEBHOOK_SECRET;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    setupBodyParsers(app);
    await app.init();

    tenant = await seedTenant();
    stripeCustomerId = `cus_${Math.random().toString(36).slice(2)}`;
    await runWithTenantContext(tenant.tenantId, async () => {
      await setTenantStripeCustomerId(stripeCustomerId);
    });
  });

  afterAll(async () => {
    await app.close();
    await getPool().end();
  });

  function post(rawBody: string, signatureHeader: string) {
    return request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', signatureHeader)
      .send(rawBody);
  }

  it('rejects a request with no signature header', async () => {
    const response = await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send('{}');

    expect(response.status).toBe(400);
  });

  it('rejects a request with an invalid signature', async () => {
    const body = JSON.stringify(stripeInvoiceEvent('invoice.created', stripeCustomerId));
    const badSignature = signStripeWebhookPayload(body, 'wrong-secret', Math.floor(Date.now() / 1000));

    const response = await post(body, badSignature);
    expect(response.status).toBe(400);
  });

  it('mirrors a valid invoice.created event into the local invoices table', async () => {
    const event = stripeInvoiceEvent('invoice.created', stripeCustomerId, { status: 'open', total: 5000 });
    const body = JSON.stringify(event);
    const signature = signStripeWebhookPayload(body, WEBHOOK_SECRET, Math.floor(Date.now() / 1000));

    const response = await post(body, signature);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true });

    const rows = await queryAsMigrator<InvoiceRow>(
      'SELECT status, total_usd_micros, stripe_invoice_id FROM invoices WHERE stripe_invoice_id = $1',
      [event.data.object.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('open');
    expect(Number(rows[0]?.total_usd_micros)).toBe(5000 * 10_000);
  });

  it('updates the same local invoice row on a follow-up event for the same Stripe invoice', async () => {
    const invoiceId = `in_${Math.random().toString(36).slice(2)}`;
    const created = stripeInvoiceEvent('invoice.created', stripeCustomerId, { id: invoiceId, status: 'open' });
    const createdBody = JSON.stringify(created);
    await post(createdBody, signStripeWebhookPayload(createdBody, WEBHOOK_SECRET, Math.floor(Date.now() / 1000)));

    const paid = stripeInvoiceEvent('invoice.payment_succeeded', stripeCustomerId, {
      id: invoiceId,
      status: 'paid',
    });
    const paidBody = JSON.stringify(paid);
    const response = await post(paidBody, signStripeWebhookPayload(paidBody, WEBHOOK_SECRET, Math.floor(Date.now() / 1000)));

    expect(response.status).toBe(200);

    const rows = await queryAsMigrator<InvoiceRow>(
      'SELECT status FROM invoices WHERE stripe_invoice_id = $1',
      [invoiceId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('paid');
  });

  it('drops an event for an unrecognized customer without erroring', async () => {
    const event = stripeInvoiceEvent('invoice.created', 'cus_does_not_exist');
    const body = JSON.stringify(event);
    const signature = signStripeWebhookPayload(body, WEBHOOK_SECRET, Math.floor(Date.now() / 1000));

    const response = await post(body, signature);
    expect(response.status).toBe(200);
  });

  it('ignores event types it does not track locally', async () => {
    const event = { id: 'evt_ignored', type: 'customer.subscription.updated', data: { object: {} } };
    const body = JSON.stringify(event);
    const signature = signStripeWebhookPayload(body, WEBHOOK_SECRET, Math.floor(Date.now() / 1000));

    const response = await post(body, signature);
    expect(response.status).toBe(200);
  });
});
