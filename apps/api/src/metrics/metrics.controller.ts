import { Controller, Get, Header } from '@nestjs/common';
import { metricsRegistry } from './metrics';

@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(): Promise<string> {
    return metricsRegistry.metrics();
  }
}
