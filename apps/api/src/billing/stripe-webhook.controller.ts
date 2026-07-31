import { BadRequestException, Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { runWithTenantContext } from '../middleware/tenant-context';
import { upsertInvoiceMirror, type StripeInvoiceObject } from './invoice-mirror.repository';
import { resolveTenantByStripeCustomerId } from './tenant-billing.repository';
import { StripeWebhookSignatureError, verifyStripeWebhookSignature } from './stripe-webhook-signature';

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

const INVOICE_EVENT_TYPES = new Set([
  'invoice.created',
  'invoice.finalized',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
]);

@Controller('webhooks')
export class StripeWebhookController {
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() request: Request,
    @Headers('stripe-signature') signatureHeader?: string,
  ): Promise<{ received: boolean }> {
    if (!signatureHeader) {
      throw new BadRequestException('Missing Stripe-Signature header');
    }

    const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    }

    const rawBody = (request.body as Buffer).toString('utf8');

    try {
      verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret);
    } catch (error) {
      if (error instanceof StripeWebhookSignatureError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const event = JSON.parse(rawBody) as StripeEvent;
    await this.processEvent(event);

    return { received: true };
  }

  private async processEvent(event: StripeEvent): Promise<void> {
    if (!INVOICE_EVENT_TYPES.has(event.type)) {
      // Not every Stripe event type maps to something this gateway
      // mirrors locally — ignoring the rest is intentional, not an
      // oversight.
      return;
    }

    const invoice = event.data.object as unknown as StripeInvoiceObject & { customer: string };
    const tenantId = await resolveTenantByStripeCustomerId(invoice.customer);
    if (!tenantId) {
      // A webhook for a customer we don't recognize (e.g. a stale test
      // event) is logged and dropped rather than failing the delivery.
      return;
    }

    await runWithTenantContext(tenantId, async () => {
      await upsertInvoiceMirror(invoice);
    });
  }
}
