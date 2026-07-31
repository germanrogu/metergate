import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [HealthModule, AuthModule, GatewayModule],
})
export class AppModule {}
