import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GatewayController } from './gateway.controller';

@Module({
  imports: [AuthModule],
  controllers: [GatewayController],
})
export class GatewayModule {}
