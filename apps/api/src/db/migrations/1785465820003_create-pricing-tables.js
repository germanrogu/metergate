/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  // Global catalog, not tenant-scoped: no RLS needed here.
  pgm.createTable('models', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    provider: { type: 'text', notNull: true },
    model_id: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('models', 'models_provider_check', "CHECK (provider IN ('openai', 'anthropic'))");
  pgm.addConstraint('models', 'models_status_check', "CHECK (status IN ('active', 'deprecated', 'retired'))");
  pgm.addConstraint('models', 'models_provider_model_unique', 'UNIQUE (provider, model_id)');

  // Prices are versioned, never updated in place: a price change closes
  // the current row (effective_to = now()) and inserts a new one. This
  // keeps historical billing correct even after a price update.
  pgm.createTable('model_pricing', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    model_id: { type: 'uuid', notNull: true, references: 'models', onDelete: 'cascade' },
    input_price_per_1k_usd_micros: { type: 'bigint', notNull: true },
    output_price_per_1k_usd_micros: { type: 'bigint', notNull: true },
    cached_input_price_per_1k_usd_micros: { type: 'bigint' },
    effective_from: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    effective_to: { type: 'timestamptz' },
    source: { type: 'text', notNull: true },
  });
  pgm.createIndex('model_pricing', ['model_id', 'effective_from']);
};

exports.down = (pgm) => {
  pgm.dropTable('model_pricing');
  pgm.dropTable('models');
};
