/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Mirror Stripe's own invoice status vocabulary directly instead of
  // inventing a lossy translation — this table exists specifically to
  // reflect what Stripe reports, so its status values should match.
  pgm.dropConstraint('invoices', 'invoices_status_check');
  pgm.addConstraint(
    'invoices',
    'invoices_status_check',
    "CHECK (status IN ('draft', 'open', 'paid', 'uncollectible', 'void'))",
  );
  pgm.alterColumn('invoices', 'status', { default: 'draft' });
  pgm.addConstraint('invoices', 'invoices_stripe_invoice_id_unique', 'UNIQUE (stripe_invoice_id)');

  // Same bootstrapping problem as resolve_gateway_api_key(): a Stripe
  // webhook arrives with no tenant context established yet, so the
  // lookup from stripe_customer_id to tenant_id has to bypass RLS via
  // a narrowly-scoped SECURITY DEFINER function rather than the normal
  // tenant-scoped query path.
  pgm.sql(`
    CREATE FUNCTION resolve_tenant_by_stripe_customer_id(p_stripe_customer_id text)
    RETURNS uuid
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT id FROM tenants WHERE stripe_customer_id = p_stripe_customer_id;
    $$;
  `);

  pgm.sql(`GRANT EXECUTE ON FUNCTION resolve_tenant_by_stripe_customer_id(text) TO metergate_app;`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP FUNCTION IF EXISTS resolve_tenant_by_stripe_customer_id(text);`);
  pgm.dropConstraint('invoices', 'invoices_stripe_invoice_id_unique');
  pgm.dropConstraint('invoices', 'invoices_status_check');
  pgm.addConstraint('invoices', 'invoices_status_check', "CHECK (status IN ('draft', 'finalized', 'paid'))");
};
