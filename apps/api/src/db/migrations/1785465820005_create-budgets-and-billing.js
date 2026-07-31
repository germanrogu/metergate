/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

const TENANT_SCOPED_TABLES = ['budgets', 'invoices'];

exports.up = (pgm) => {
  // Redis holds the real-time reservation counters; this table is the
  // durable source of truth a reconciliation job corrects Redis against.
  pgm.createTable('budgets', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    period_start: { type: 'date', notNull: true },
    period_end: { type: 'date', notNull: true },
    limit_usd_micros: { type: 'bigint', notNull: true },
    spent_usd_micros: { type: 'bigint', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('budgets', 'budgets_tenant_period_unique', 'UNIQUE (tenant_id, period_start, period_end)');

  pgm.createTable('invoices', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    period_start: { type: 'date', notNull: true },
    period_end: { type: 'date', notNull: true },
    total_usd_micros: { type: 'bigint', notNull: true, default: 0 },
    status: { type: 'text', notNull: true, default: 'draft' },
    stripe_invoice_id: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'invoices',
    'invoices_status_check',
    "CHECK (status IN ('draft', 'finalized', 'paid'))",
  );

  pgm.createTable('invoice_line_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    invoice_id: { type: 'uuid', notNull: true, references: 'invoices', onDelete: 'cascade' },
    feature: { type: 'text' },
    description: { type: 'text', notNull: true },
    quantity: { type: 'bigint', notNull: true },
    unit_cost_usd_micros: { type: 'bigint', notNull: true },
    amount_usd_micros: { type: 'bigint', notNull: true },
  });
  pgm.createIndex('invoice_line_items', 'invoice_id');

  for (const table of TENANT_SCOPED_TABLES) {
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    pgm.sql(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    pgm.sql(`
      CREATE POLICY tenant_isolation ON ${table}
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    `);
  }

  // invoice_line_items has no tenant_id of its own; isolation is enforced
  // by joining through invoices, which is already RLS-protected.
  pgm.sql(`ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;`);
  pgm.sql(`ALTER TABLE invoice_line_items FORCE ROW LEVEL SECURITY;`);
  pgm.sql(`
    CREATE POLICY tenant_isolation ON invoice_line_items
    USING (invoice_id IN (SELECT id FROM invoices));
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('invoice_line_items');
  pgm.dropTable('invoices');
  pgm.dropTable('budgets');
};
