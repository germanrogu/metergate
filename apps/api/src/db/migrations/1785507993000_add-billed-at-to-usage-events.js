/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('usage_events', {
    billed_at: { type: 'timestamptz' },
  });
  pgm.createIndex('usage_events', ['tenant_id', 'billed_at']);
};

exports.down = (pgm) => {
  pgm.dropColumn('usage_events', 'billed_at');
};
