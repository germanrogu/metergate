import { withTenantTransaction } from '../db/with-tenant-transaction';

export interface StripeInvoiceObject {
  id: string;
  status: string;
  total: number;
  period_start: number;
  period_end: number;
}

const USD_MICROS_PER_CENT = 10_000;

function toDateOnly(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

// Stripe is the source of truth for what was actually billed; this
// table is a read-optimized local mirror the dashboard queries,
// upserted whenever a relevant webhook event arrives. Assumes USD
// (Stripe's `total` is in cents) — multi-currency isn't handled here.
export async function upsertInvoiceMirror(invoice: StripeInvoiceObject): Promise<void> {
  const totalUsdMicros = invoice.total * USD_MICROS_PER_CENT;

  await withTenantTransaction(async (client) => {
    await client.query(
      `INSERT INTO invoices (tenant_id, period_start, period_end, total_usd_micros, status, stripe_invoice_id)
       VALUES (current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5)
       ON CONFLICT (stripe_invoice_id) DO UPDATE SET
         status = EXCLUDED.status,
         total_usd_micros = EXCLUDED.total_usd_micros,
         period_start = EXCLUDED.period_start,
         period_end = EXCLUDED.period_end`,
      [toDateOnly(invoice.period_start), toDateOnly(invoice.period_end), totalUsdMicros, invoice.status, invoice.id],
    );
  });
}
