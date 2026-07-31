import type { INestApplication } from '@nestjs/common';
import * as express from 'express';

// Stripe signs the exact raw bytes of the request body, so the webhook
// route needs the untouched Buffer instead of the JSON-parsed and
// re-serialized body every other route gets. Requires the app to be
// created with { bodyParser: false } — otherwise Nest's default parser
// already consumed the stream before this ever runs.
export function setupBodyParsers(app: INestApplication): void {
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.originalUrl === '/webhooks/stripe') {
      express.raw({ type: 'application/json' })(req, res, next);
    } else {
      express.json()(req, res, next);
    }
  });
}
