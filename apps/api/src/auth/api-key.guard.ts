import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { hashApiKey } from '../api-keys/api-key.util';
import { resolveApiKeyByHash, touchApiKeyLastUsed } from '../api-keys/api-keys.repository';

export interface AuthenticatedRequest extends Request {
  tenantId?: string;
  projectId?: string;
  apiKeyId?: string;
}

const BEARER_PREFIX = 'Bearer ';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers['authorization'];

    if (!header || !header.startsWith(BEARER_PREFIX)) {
      throw new UnauthorizedException('Missing API key');
    }

    const plaintext = header.slice(BEARER_PREFIX.length).trim();
    const resolved = await resolveApiKeyByHash(hashApiKey(plaintext));

    if (!resolved || resolved.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    request.tenantId = resolved.tenantId;
    request.projectId = resolved.projectId;
    request.apiKeyId = resolved.id;

    // Fire-and-forget: a slow or failed last-used update should never
    // block or fail the request it's tracking.
    void touchApiKeyLastUsed(resolved.id);

    return true;
  }
}
