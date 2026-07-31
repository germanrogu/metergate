/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Append-only fact table. Cost is denormalized here at write time
  // against the price that was in effect at occurred_at, so a later
  // correction in model_pricing never rewrites historical billing.
  pgm.createTable('usage_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    api_key_id: { type: 'uuid', notNull: true, references: 'api_keys' },
    provider: { type: 'text', notNull: true },
    model: { type: 'text', notNull: true },
    feature: { type: 'text' },
    agent_run_id: { type: 'uuid' },
    input_tokens: { type: 'integer', notNull: true },
    output_tokens: { type: 'integer', notNull: true },
    latency_ms: { type: 'integer', notNull: true },
    cost_usd_micros: { type: 'bigint' },
    pricing_unresolved: { type: 'boolean', notNull: true, default: false },
    status: { type: 'text', notNull: true },
    error_code: { type: 'text' },
    terminated_reason: { type: 'text' },
    idempotency_key: { type: 'text' },
    occurred_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('usage_events', 'usage_events_status_check', "CHECK (status IN ('success', 'error', 'blocked'))");
  pgm.addConstraint(
    'usage_events',
    'usage_events_idempotency_unique',
    'UNIQUE (tenant_id, idempotency_key)',
  );

  pgm.createIndex('usage_events', ['tenant_id', 'occurred_at']);
  pgm.createIndex('usage_events', ['tenant_id', 'feature']);

  pgm.sql(`ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;`);
  pgm.sql(`ALTER TABLE usage_events FORCE ROW LEVEL SECURITY;`);
  pgm.sql(`
    CREATE POLICY tenant_isolation ON usage_events
    USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('usage_events');
};
