import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { TenantContextInterceptor } from '../auth/tenant-context.interceptor';
import type { CallerProvider } from '../providers/provider-adapter.factory';
import {
  createApiKeyForTenant,
  getApiKeyForTenant,
  listApiKeysForTenant,
  revokeApiKeyAt,
  rotateApiKey,
} from './tenant-api-keys.repository';

const SUPPORTED_SCOPES: CallerProvider[] = ['openai', 'anthropic'];

interface CreateApiKeyBody {
  label: string;
  scopes: CallerProvider[];
}

interface RotateApiKeyBody {
  label?: string;
  scopes?: CallerProvider[];
  graceHours?: number;
}

// Reuses the tenant's own gateway key for authentication — the same
// simplification the rest of this project makes (no separate
// dashboard-session auth system). A real product would likely scope
// key-management to a different credential than the one used for LLM
// calls; noted here rather than silently assumed equivalent.
@Controller('api-keys')
@UseGuards(ApiKeyGuard)
@UseInterceptors(TenantContextInterceptor)
export class ApiKeysController {
  @Get()
  async list() {
    return listApiKeysForTenant();
  }

  @Post()
  async create(@Body() body: CreateApiKeyBody) {
    this.validateScopes(body.scopes);
    if (!body.label) {
      throw new BadRequestException('label is required');
    }
    return createApiKeyForTenant({ label: body.label, scopes: body.scopes });
  }

  @Post(':id/revoke')
  async revoke(@Param('id') id: string) {
    const existing = await getApiKeyForTenant(id);
    if (!existing) {
      throw new NotFoundException('API key not found');
    }
    await revokeApiKeyAt(id, new Date());
    return { revoked: true };
  }

  @Post(':id/rotate')
  async rotate(@Param('id') id: string, @Body() body: RotateApiKeyBody) {
    if (body.scopes) {
      this.validateScopes(body.scopes);
    }
    try {
      return await rotateApiKey(
        id,
        { label: body.label, scopes: body.scopes },
        body.graceHours,
      );
    } catch {
      throw new NotFoundException('API key not found');
    }
  }

  private validateScopes(scopes: CallerProvider[]): void {
    if (!Array.isArray(scopes) || scopes.length === 0) {
      throw new BadRequestException('scopes must be a non-empty array');
    }
    for (const scope of scopes) {
      if (!SUPPORTED_SCOPES.includes(scope)) {
        throw new BadRequestException(`scopes must be one of: ${SUPPORTED_SCOPES.join(', ')}`);
      }
    }
  }
}
