/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('tenants', {
    stripe_customer_id: { type: 'text' },
  });
  pgm.addConstraint('tenants', 'tenants_stripe_customer_id_unique', 'UNIQUE (stripe_customer_id)');
};

exports.down = (pgm) => {
  pgm.dropConstraint('tenants', 'tenants_stripe_customer_id_unique');
  pgm.dropColumn('tenants', 'stripe_customer_id');
};
