import { getPool } from '../db/pool';
import { withTenantTransaction } from '../db/with-tenant-transaction';

interface ResolveTenantRow {
  resolve_tenant_by_stripe_customer_id: string | null;
}

// Goes through the resolve_tenant_by_stripe_customer_id() SECURITY
// DEFINER function rather than a plain tenant-scoped query, for the
// same reason api-keys.repository does: a Stripe webhook arrives
// before any tenant context exists, so this lookup can't be RLS-scoped.
export async function resolveTenantByStripeCustomerId(stripeCustomerId: string): Promise<string | null> {
  const result = await getPool().query<ResolveTenantRow>('SELECT resolve_tenant_by_stripe_customer_id($1)', [
    stripeCustomerId,
  ]);
  return result.rows[0]?.resolve_tenant_by_stripe_customer_id ?? null;
}

export async function setTenantStripeCustomerId(stripeCustomerId: string): Promise<void> {
  await withTenantTransaction(async (client) => {
    await client.query(
      `UPDATE tenants SET stripe_customer_id = $1 WHERE id = current_setting('app.tenant_id')::uuid`,
      [stripeCustomerId],
    );
  });
}
