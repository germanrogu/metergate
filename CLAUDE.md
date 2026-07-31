# CLAUDE.md

Guidance for working in this repository.

## What this is

Metergate is an AI usage metering & billing gateway: a proxy in front of LLM
provider APIs (OpenAI, Anthropic) that records tokens/cost/latency per call,
attributes cost to a tenant/project/feature, enforces rate limits and
budgets in real time, and bills usage through Stripe's metered billing API
(test mode).

## Non-negotiable conventions

- **Docker only.** Never run `node`/`npm` directly on the host. All dev,
  test, and build commands run inside the containers defined in
  `docker-compose.yml`.
- **Node version pinned** via `.nvmrc` (22.14.0), matched by the Docker base
  images (`node:22.14-slim`).
- **TypeScript strict everywhere** — `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride` in every `tsconfig.json`.
- **Tests required from the first commit.** Vitest per package. No feature
  merges without coverage for it.
- **Never commit secrets.** `.env` is gitignored; `.env.example` documents
  every variable with a placeholder value.

## Scope decisions (why some things are deliberately not built)

- **BYOK only.** Tenants bring their own OpenAI/Anthropic API key
  (encrypted at rest). The gateway never holds provider credit on their
  behalf. A `credential_source` column on `provider_credentials` reserves
  the future "platform pays" model, but only `'tenant'` is implemented.
- **No response-quality evaluation (RAGAS-style).** The gateway is
  content-agnostic by design — it proxies bytes, it does not interpret
  what was asked or generated. An optional `eval_run_id` in call metadata
  is the integration point for a separate eval project, kept decoupled.
- **No admin back-office UI.** Tenants/plans are seeded via migration or
  script, not a CRUD screen.
- **No Kubernetes.** Docker Compose is the full local story; a simple
  Render/Fly deploy is enough for a public demo URL.

## Structure

```
apps/api/     NestJS — the gateway, metering, billing, dashboard API
apps/web/     Next.js — the dashboard
packages/shared/  zod schemas shared between api and web
```

## Commands

```bash
docker compose up              # start db, redis, api, web
docker compose exec api npm test
docker compose exec api npm run test:integration
docker compose exec api npm run migrate:up
docker compose exec api npm run lint
docker compose exec api npm run typecheck
docker compose exec api npm run build
```

## Multi-tenancy

Postgres row-level security enforces tenant isolation on every
tenant-scoped table. The application connects as `metergate_app`, an
unprivileged role with `FORCE ROW LEVEL SECURITY` applied — it can never
bypass isolation, unlike a table owner or superuser would. Tenant context
is set per-request with `SET LOCAL app.tenant_id` inside a short
transaction via `AsyncLocalStorage`. Migrations run as a separate
`metergate_migrator` role (see `MIGRATIONS_DATABASE_URL`).

The proxy call to the LLM provider itself never happens inside an open
Postgres transaction — it can take 30-60s under streaming. The
transaction that persists a `usage_event` and reconciles budget state
opens only after the provider call finishes (or is cut short).

## Known gotcha: `next build` under the bind-mounted dev container

Running `docker compose exec web npm run build` (or `docker compose run web
npm run build`) can fail with `<Html> should not be imported outside of
pages/_document` while prerendering the auto-generated `/404`/`/500`
fallback, even on a stock App-Router project with no custom error pages.
This reproduced identically on Next 14.2.5, 14.2.35, and 15.5.22, but
disappears entirely when the same image is run without the
`docker-compose.yml` bind mount (`docker run --rm metergate-web npm run
build`, no `-v .:/workspace`). Root cause: Docker Desktop's macOS
bind-mount file sync (virtiofs) racing with Next's build output writes,
not a bug in this codebase or in Next itself. CI is unaffected — GitHub
Actions runs directly on the runner's filesystem, no Docker bind mount
involved — so CI is the real source of truth for build correctness. If
you need to verify a production build locally, build the image fresh
(`docker compose build web`) and run it without the dev bind mount rather
than `docker compose exec`/`run`.
