import { Module } from '@nestjs/common';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  controllers: [StripeWebhookController],
})
export class BillingModule {}
