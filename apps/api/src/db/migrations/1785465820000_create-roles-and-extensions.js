/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createExtension('pgcrypto', { ifNotExists: true });

  // Runtime role used by the application. It is intentionally NOT a
  // superuser and NOT the owner of any table, so row level security
  // policies (added per-table below) always apply to it, even on
  // tables created with FORCE ROW LEVEL SECURITY.
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metergate_app') THEN
        CREATE ROLE metergate_app LOGIN PASSWORD 'metergate_app';
      END IF;
    END
    $$;
  `);

  pgm.sql(`GRANT CONNECT ON DATABASE metergate TO metergate_app;`);
  pgm.sql(`GRANT USAGE ON SCHEMA public TO metergate_app;`);
  pgm.sql(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO metergate_app;`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM metergate_app;`);
  pgm.sql(`REVOKE USAGE ON SCHEMA public FROM metergate_app;`);
  pgm.sql(`REVOKE CONNECT ON DATABASE metergate FROM metergate_app;`);
  pgm.sql(`DROP ROLE IF EXISTS metergate_app;`);
};
