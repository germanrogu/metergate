/* eslint-disable @typescript-eslint/no-var-requires */
exports.shorthands = undefined;

// Illustrative seed prices for the demo/portfolio deployment — NOT a
// live pricing feed. Production use would need a real, regularly
// reviewed source (see CLAUDE.md's note on model_pricing versioning);
// this only exists so the gateway has something to resolve against
// locally and in CI.
const MODELS = [
  { provider: 'openai', model_id: 'gpt-4o-mini', input: 150_000, output: 600_000 },
  { provider: 'openai', model_id: 'gpt-4o', input: 2_500_000, output: 10_000_000 },
  { provider: 'anthropic', model_id: 'claude-3-5-haiku-latest', input: 800_000, output: 4_000_000 },
  { provider: 'anthropic', model_id: 'claude-3-5-sonnet-latest', input: 3_000_000, output: 15_000_000 },
];

exports.up = async (pgm) => {
  for (const model of MODELS) {
    const modelResult = await pgm.db.query(
      `INSERT INTO models (provider, model_id) VALUES ($1, $2) RETURNING id`,
      [model.provider, model.model_id],
    );
    const modelId = modelResult.rows[0].id;

    await pgm.db.query(
      `INSERT INTO model_pricing (model_id, input_price_per_1k_usd_micros, output_price_per_1k_usd_micros, source)
       VALUES ($1, $2, $3, 'seed')`,
      [modelId, model.input, model.output],
    );
  }
};

exports.down = async (pgm) => {
  const modelIds = MODELS.map((model) => model.model_id);
  await pgm.db.query('DELETE FROM model_pricing WHERE model_id IN (SELECT id FROM models WHERE model_id = ANY($1))', [
    modelIds,
  ]);
  await pgm.db.query('DELETE FROM models WHERE model_id = ANY($1)', [modelIds]);
};
