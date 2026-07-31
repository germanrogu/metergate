import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { runWithTenantContext } from '../middleware/tenant-context';
import type { AuthenticatedRequest } from './api-key.guard';

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.tenantId) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      runWithTenantContext(request.tenantId as string, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
