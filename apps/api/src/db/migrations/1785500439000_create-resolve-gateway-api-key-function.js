/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

// Authenticating a gateway API key is a chicken-and-egg problem under RLS:
// looking up api_keys by hash has to happen BEFORE we know which tenant
// the request belongs to, so it can't go through the normal tenant-scoped
// path. This SECURITY DEFINER function runs as its owner (the migrator
// role, which isn't subject to the tenant_isolation policy) and exposes
// only the narrow fields auth needs — never a general escape hatch.
exports.up = (pgm) => {
  pgm.sql(`
    CREATE FUNCTION resolve_gateway_api_key(p_key_hash text)
    RETURNS TABLE (
      id uuid,
      tenant_id uuid,
      project_id uuid,
      scopes text[],
      revoked_at timestamptz
    )
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT id, tenant_id, project_id, scopes, revoked_at
      FROM api_keys
      WHERE key_hash = p_key_hash;
    $$;
  `);

  pgm.sql(`GRANT EXECUTE ON FUNCTION resolve_gateway_api_key(text) TO metergate_app;`);

  // Touching last_used_at on every authenticated call is the same
  // chicken-and-egg problem in reverse (a write, not a read), so it gets
  // the same narrowly-scoped SECURITY DEFINER treatment.
  pgm.sql(`
    CREATE FUNCTION touch_gateway_api_key(p_id uuid)
    RETURNS void
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $$
      UPDATE api_keys SET last_used_at = now() WHERE id = p_id;
    $$;
  `);

  pgm.sql(`GRANT EXECUTE ON FUNCTION touch_gateway_api_key(uuid) TO metergate_app;`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP FUNCTION IF EXISTS touch_gateway_api_key(uuid);`);
  pgm.sql(`DROP FUNCTION IF EXISTS resolve_gateway_api_key(text);`);
};
