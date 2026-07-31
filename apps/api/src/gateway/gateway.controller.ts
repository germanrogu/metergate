import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiKeyGuard, type AuthenticatedRequest } from '../auth/api-key.guard';
import { TenantContextInterceptor } from '../auth/tenant-context.interceptor';
import { recordUsageEvent } from '../metering/metering.repository';
import { getTenantPlanLimits } from '../budgets/plan-limits.repository';
import { consumeRateLimitToken } from '../budgets/rate-limiter';
import { circuitKey, gatewayCircuitBreaker } from './circuit-breaker';
import { calculateCostUsdMicros } from '../pricing/pricing.service';
import { resolvePricing } from '../pricing/pricing.repository';
import { getProviderCredential } from '../provider-credentials/provider-credentials.repository';
import { createProviderAdapter } from '../providers/provider-adapter.factory';
import {
  ProviderMalformedResponseError,
  ProviderRateLimitedError,
  ProviderStreamCutoffError,
  ProviderTimeoutError,
} from '../providers/provider-adapter';
import { estimateTokens } from './estimate-tokens';
import type { GatewayCompletionRequestBody, GatewayCompletionResponseBody } from './gateway.dto';
import { getIdempotentResponse, storeIdempotentResponse } from './idempotency-cache';

const SUPPORTED_PROVIDERS = ['openai', 'anthropic'] as const;

@Controller('v1/chat/completions')
@UseGuards(ApiKeyGuard)
@UseInterceptors(TenantContextInterceptor)
export class GatewayController {
  @Post()
  @HttpCode(HttpStatus.OK)
  async complete(
    @Body() body: GatewayCompletionRequestBody,
    @Req() request: AuthenticatedRequest,
  ): Promise<GatewayCompletionResponseBody> {
    this.validateRequest(body);

    const idempotencyKey = (request.headers['idempotency-key'] as string | undefined) ?? null;

    if (idempotencyKey) {
      const cached = await getIdempotentResponse(request.tenantId as string, idempotencyKey);
      if (cached) {
        return { ...cached, replayed: true };
      }
    }

    const planLimits = await getTenantPlanLimits();
    if (planLimits) {
      const withinLimit = await consumeRateLimitToken(request.apiKeyId as string, {
        capacity: planLimits.rateLimitBurst,
        refillPerSecond: planLimits.rateLimitPerMinute / 60,
      });
      if (!withinLimit) {
        await recordUsageEvent({
          apiKeyId: request.apiKeyId as string,
          provider: body.provider,
          model: body.model,
          feature: body.feature ?? null,
          agentRunId: body.agentRunId ?? null,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
          costUsdMicros: null,
          pricingUnresolved: true,
          status: 'blocked',
          errorCode: 'rate_limited',
          terminatedReason: null,
          idempotencyKey,
        });
        throw new HttpException('Rate limit exceeded for this API key', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const breakerKey = circuitKey(body.provider, body.model);
    if (!gatewayCircuitBreaker.canProceed(breakerKey)) {
      await recordUsageEvent({
        apiKeyId: request.apiKeyId as string,
        provider: body.provider,
        model: body.model,
        feature: body.feature ?? null,
        agentRunId: body.agentRunId ?? null,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        costUsdMicros: null,
        pricingUnresolved: true,
        status: 'blocked',
        errorCode: 'circuit_open',
        terminatedReason: null,
        idempotencyKey,
      });
      throw new HttpException(
        `Circuit open for ${body.provider}/${body.model} after repeated failures`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const credential = await getProviderCredential(body.provider);
    if (!credential) {
      throw new BadRequestException(`No ${body.provider} credential configured for this tenant`);
    }

    const adapter = createProviderAdapter({
      provider: body.provider,
      credential,
      mockScenario: body.mockScenario,
    });

    const startedAt = Date.now();
    const contentParts: string[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for await (const chunk of adapter.send({
        model: body.model,
        messages: body.messages,
        maxTokens: body.maxTokens,
      })) {
        if (chunk.contentDelta) {
          contentParts.push(chunk.contentDelta);
        }
        if (chunk.done) {
          inputTokens = chunk.inputTokens ?? 0;
          outputTokens = chunk.outputTokens ?? 0;
        }
      }
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      if (this.shouldTripBreaker(error)) {
        gatewayCircuitBreaker.recordFailure(breakerKey);
      }
      await this.recordFailure(error, body, request, idempotencyKey, latencyMs);
      throw this.mapProviderError(error);
    }

    gatewayCircuitBreaker.recordSuccess(breakerKey);
    const latencyMs = Date.now() - startedAt;
    const pricing = await resolvePricing(body.provider, body.model, new Date());
    const costUsdMicros = pricing ? calculateCostUsdMicros(inputTokens, outputTokens, pricing) : null;

    await recordUsageEvent({
      apiKeyId: request.apiKeyId as string,
      provider: body.provider,
      model: body.model,
      feature: body.feature ?? null,
      agentRunId: body.agentRunId ?? null,
      inputTokens,
      outputTokens,
      latencyMs,
      costUsdMicros,
      pricingUnresolved: !pricing,
      status: 'success',
      errorCode: null,
      terminatedReason: null,
      idempotencyKey,
    });

    const response: GatewayCompletionResponseBody = {
      content: contentParts.join(''),
      inputTokens,
      outputTokens,
      costUsdMicros,
      latencyMs,
    };

    if (idempotencyKey) {
      await storeIdempotentResponse(request.tenantId as string, idempotencyKey, response);
    }

    return response;
  }

  private validateRequest(body: GatewayCompletionRequestBody): void {
    if (!SUPPORTED_PROVIDERS.includes(body.provider)) {
      throw new BadRequestException(`provider must be one of: ${SUPPORTED_PROVIDERS.join(', ')}`);
    }
    if (!body.model) {
      throw new BadRequestException('model is required');
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      throw new BadRequestException('messages must be a non-empty array');
    }
  }

  // A stream cutoff still gets billed for what was actually delivered —
  // never treated as a plain error — even though this non-streaming
  // endpoint can't hand the client the partial content itself (that
  // only becomes possible once streaming responses land).
  private async recordFailure(
    error: unknown,
    body: GatewayCompletionRequestBody,
    request: AuthenticatedRequest,
    idempotencyKey: string | null,
    latencyMs: number,
  ): Promise<void> {
    if (error instanceof ProviderStreamCutoffError) {
      const pricing = await resolvePricing(body.provider, body.model, new Date());
      const outputTokens = error.deliveredOutputTokens;
      const inputTokens = estimateTokens(body.messages.map((message) => message.content).join(' '));
      const costUsdMicros = pricing ? calculateCostUsdMicros(inputTokens, outputTokens, pricing) : null;

      await recordUsageEvent({
        apiKeyId: request.apiKeyId as string,
        provider: body.provider,
        model: body.model,
        feature: body.feature ?? null,
        agentRunId: body.agentRunId ?? null,
        inputTokens,
        outputTokens,
        latencyMs,
        costUsdMicros,
        pricingUnresolved: !pricing,
        status: 'success',
        errorCode: null,
        terminatedReason: 'provider_disconnect',
        idempotencyKey,
      });
      return;
    }

    await recordUsageEvent({
      apiKeyId: request.apiKeyId as string,
      provider: body.provider,
      model: body.model,
      feature: body.feature ?? null,
      agentRunId: body.agentRunId ?? null,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs,
      costUsdMicros: null,
      pricingUnresolved: true,
      status: 'error',
      errorCode: this.errorCode(error),
      terminatedReason: null,
      idempotencyKey,
    });
  }

  // Rate limits and mid-stream cutoffs aren't provider-health signals —
  // a 429 means "you're sending too much," and a cutoff was already
  // billed as a (partial) success — so neither should trip the breaker.
  // Timeouts, malformed responses, and anything unexpected do.
  private shouldTripBreaker(error: unknown): boolean {
    return !(error instanceof ProviderRateLimitedError) && !(error instanceof ProviderStreamCutoffError);
  }

  private errorCode(error: unknown): string {
    if (error instanceof ProviderRateLimitedError) return 'provider_rate_limited';
    if (error instanceof ProviderTimeoutError) return 'provider_timeout';
    if (error instanceof ProviderMalformedResponseError) return 'provider_malformed_response';
    return 'unknown_provider_error';
  }

  private mapProviderError(error: unknown): HttpException {
    if (error instanceof ProviderRateLimitedError) {
      return new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (error instanceof ProviderTimeoutError) {
      return new HttpException(error.message, HttpStatus.GATEWAY_TIMEOUT);
    }
    if (error instanceof ProviderMalformedResponseError || error instanceof ProviderStreamCutoffError) {
      return new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
    return new HttpException('Unexpected gateway error', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
