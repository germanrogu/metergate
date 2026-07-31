import type { StripeClient } from './stripe-client';
import { getUnbilledUsageEvents, markUsageEventsBilled } from './usage-billing.repository';

const METER_EVENT_NAME = 'gateway_usage_cost_micros';

export interface ReportTenantUsageResult {
  reportedCount: number;
  failedCount: number;
}

// Runs within an already-established tenant context, same as every
// other tenant-scoped repository call in this codebase. A real
// deployment would trigger this per tenant from a scheduled job that
// enumerates tenants with a configured stripe_customer_id — that
// enumeration is a platform-level operation (same bucket as tenant
// creation, see CLAUDE.md) and isn't built here.
export async function reportTenantUsage(
  stripeClient: StripeClient,
  stripeCustomerId: string,
): Promise<ReportTenantUsageResult> {
  const unbilled = await getUnbilledUsageEvents();
  const reportedIds: string[] = [];
  let failedCount = 0;

  for (const event of unbilled) {
    try {
      // The usage_event's own id is the Stripe idempotency identifier —
      // re-running this job after a crash or overlapping invocation
      // reports the same event again, but Stripe's own dedup on
      // identifier means it never gets billed twice.
      await stripeClient.reportMeterEvent({
        eventName: METER_EVENT_NAME,
        stripeCustomerId,
        value: event.costUsdMicros,
        identifier: event.id,
      });
      reportedIds.push(event.id);
    } catch {
      failedCount += 1;
    }
  }

  await markUsageEventsBilled(reportedIds);

  return { reportedCount: reportedIds.length, failedCount };
}
