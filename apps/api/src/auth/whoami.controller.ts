import { Controller, Get, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiKeyGuard, type AuthenticatedRequest } from './api-key.guard';
import { TenantContextInterceptor } from './tenant-context.interceptor';

interface WhoamiResponse {
  tenantId: string;
  projectId: string;
  apiKeyId: string;
}

@Controller('whoami')
@UseGuards(ApiKeyGuard)
@UseInterceptors(TenantContextInterceptor)
export class WhoamiController {
  @Get()
  whoami(@Req() request: AuthenticatedRequest): WhoamiResponse {
    return {
      tenantId: request.tenantId as string,
      projectId: request.projectId as string,
      apiKeyId: request.apiKeyId as string,
    };
  }
}
