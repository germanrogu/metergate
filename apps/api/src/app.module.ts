import { Module } from '@nestjs/common';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [HealthModule, AuthModule, GatewayModule, BillingModule, MetricsModule, ApiKeysModule],
})
export class AppModule {}
