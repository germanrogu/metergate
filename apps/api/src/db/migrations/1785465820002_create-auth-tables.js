/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

const TENANT_SCOPED_TABLES = ['api_keys', 'provider_credentials'];

exports.up = (pgm) => {
  pgm.createTable('api_keys', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    project_id: { type: 'uuid', notNull: true, references: 'projects', onDelete: 'cascade' },
    key_hash: { type: 'text', notNull: true, unique: true },
    key_prefix: { type: 'text', notNull: true },
    label: { type: 'text', notNull: true },
    scopes: { type: 'text[]', notNull: true },
    revoked_at: { type: 'timestamptz' },
    last_used_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('api_keys', 'tenant_id');

  // BYOK: the tenant's own provider credential, encrypted at rest. The
  // gateway never holds platform-owned provider credit in this project
  // (see credential_source) — that mode is architected, not implemented.
  pgm.createTable('provider_credentials', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: { type: 'uuid', notNull: true, references: 'tenants', onDelete: 'cascade' },
    provider: { type: 'text', notNull: true },
    encrypted_key: { type: 'text', notNull: true },
    key_last4: { type: 'text', notNull: true },
    credential_source: { type: 'text', notNull: true, default: 'tenant' },
    is_active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('provider_credentials', 'provider_credentials_provider_check', "CHECK (provider IN ('openai', 'anthropic'))");
  pgm.addConstraint(
    'provider_credentials',
    'provider_credentials_source_check',
    "CHECK (credential_source IN ('tenant', 'platform'))",
  );
  pgm.addConstraint(
    'provider_credentials',
    'provider_credentials_tenant_provider_unique',
    'UNIQUE (tenant_id, provider)',
  );

  for (const table of TENANT_SCOPED_TABLES) {
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    pgm.sql(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
    pgm.sql(`
      CREATE POLICY tenant_isolation ON ${table}
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    `);
  }
};

exports.down = (pgm) => {
  pgm.dropTable('provider_credentials');
  pgm.dropTable('api_keys');
};
