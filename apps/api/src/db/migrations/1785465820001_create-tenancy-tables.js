/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

const TENANT_SCOPED_TABLES = ['tenants', 'projects'];

exports.up = (pgm) => {
  pgm.createTable('plans', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true, unique: true },
    monthly_budget_usd_micros: { type: 'bigint', notNull: true },
    rate_limit_per_minute: { type: 'integer', notNull: true },
    rate_limit_burst: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('tenants', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    slug: { type: 'text', notNull: true, unique: true },
    plan_id: { type: 'uuid', notNull: true, references: 'plans' },
    status: { type: 'text', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('tenants', 'tenants_status_check', "CHECK (status IN ('active', 'suspended'))");

  pgm.createTable('projects', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    name: { type: 'text', notNull: true },
    environment: { type: 'text', notNull: true, default: 'development' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'projects',
    'projects_environment_check',
    "CHECK (environment IN ('development', 'staging', 'production'))",
  );
  pgm.createIndex('projects', 'tenant_id');

  // Platform admins are a separate identity space from tenants: default
  // deny via RLS, no policies granted here. Access for internal tooling
  // is added later via narrowly scoped SECURITY DEFINER functions, never
  // by relaxing this table's row level security directly.
  pgm.createTable('platform_admins', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'text', notNull: true, unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  for (const table of TENANT_SCOPED_TABLES) {
    const tenantColumn = table === 'tenants' ? 'id' : 'tenant_id';
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    pgm.sql(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    pgm.sql(`
      CREATE POLICY tenant_isolation ON ${table}
      USING (${tenantColumn} = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    `);
  }

  pgm.sql(`ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;`);
  pgm.sql(`ALTER TABLE platform_admins FORCE ROW LEVEL SECURITY;`);
};

exports.down = (pgm) => {
  pgm.dropTable('platform_admins');
  pgm.dropTable('projects');
  pgm.dropTable('tenants');
  pgm.dropTable('plans');
};
