import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [HealthModule, AuthModule, GatewayModule, BillingModule],
})
export class AppModule {}
