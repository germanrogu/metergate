import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { WhoamiController } from './whoami.controller';

@Module({
  controllers: [WhoamiController],
  providers: [ApiKeyGuard, TenantContextInterceptor],
})
export class AuthModule {}
