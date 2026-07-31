import { withTenantTransaction } from '../db/with-tenant-transaction';

export interface PlanLimits {
  rateLimitPerMinute: number;
  rateLimitBurst: number;
  monthlyBudgetUsdMicros: number;
}

interface PlanLimitsRow {
  rate_limit_per_minute: number;
  rate_limit_burst: number;
  monthly_budget_usd_micros: string;
}

export async function getTenantPlanLimits(): Promise<PlanLimits | null> {
  return withTenantTransaction(async (client) => {
    const result = await client.query<PlanLimitsRow>(
      `SELECT p.rate_limit_per_minute, p.rate_limit_burst, p.monthly_budget_usd_micros
       FROM tenants t
       JOIN plans p ON p.id = t.plan_id
       WHERE t.id = current_setting('app.tenant_id')::uuid`,
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      rateLimitPerMinute: row.rate_limit_per_minute,
      rateLimitBurst: row.rate_limit_burst,
      monthlyBudgetUsdMicros: Number(row.monthly_budget_usd_micros),
    };
  });
}
