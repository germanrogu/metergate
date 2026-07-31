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
  (encrypted at rest, AES-256-GCM). The gateway never holds provider
  credit on their behalf. A `credential_source` column on
  `provider_credentials` reserves the future "platform pays" model, but
  only `'tenant'` is implemented.
- **No response-quality evaluation (RAGAS-style).** The gateway is
  content-agnostic by design — it proxies bytes, it does not interpret
  what was asked or generated. An optional `eval_run_id` in call metadata
  is the integration point for a separate eval project, kept decoupled.
- **No admin back-office UI.** Tenants/plans are seeded via migration or
  script (`npm run seed`), not a CRUD screen — the only way to create a
  tenant at all, since that's not exposed through the tenant-scoped API.
- **No streaming (SSE) yet.** The proxy is non-streaming; the reliability
  work for partial delivery (mid-stream cutoff billing, estimated token
  counts when the provider never sends final usage) is built ahead of it
  so streaming can land as a proxy-mechanics change, not a billing-logic
  rewrite.
- **No live Stripe account.** Colombia isn't a supported Stripe account
  country — the client, webhook signature verification, and invoice
  mirror are built and tested against Stripe's documented API contracts
  (mocked `fetch`, self-generated webhook signatures) rather than a live
  sandbox. Swapping in real test-mode credentials requires no code
  changes.
- **No scheduled trigger for the usage-billing job.** `reportTenantUsage()`
  reports one tenant's unbilled usage; enumerating all tenants with a
  configured Stripe customer to drive this on a cron is a platform-level
  operation, same bucket as tenant creation — not built.
- **In-memory, single-instance circuit breaker and rate limiter aren't
  shared across multiple gateway instances.** A horizontally-scaled
  deployment would need the circuit breaker's state in Redis (atomic
  transitions via a Lua script); the token-bucket rate limiter already is
  Redis-backed and would scale as-is.
- **No Kubernetes.** Docker Compose is the full local story; a simple
  Render/Fly deploy is enough for a public demo URL.

## Structure

```
apps/api/     NestJS — the gateway, metering, billing, dashboard API
apps/web/     Next.js — the dashboard
packages/shared/  zod schemas shared between api and web
```

Inside `apps/api/src/`:

| Module | Responsibility |
|---|---|
| `auth/` | Gateway API key guard, tenant context interceptor, `/whoami` |
| `api-keys/` | Key generation/hashing, tenant-facing create/list/revoke/rotate |
| `provider-credentials/` | BYOK encryption + per-tenant credential storage |
| `providers/` | `ProviderAdapter` interface, mock/OpenAI/Anthropic adapters, factory |
| `pricing/` | Versioned model pricing resolution + cost calculation |
| `metering/` | `usage_events` persistence |
| `budgets/` | Redis token-bucket rate limiter, budget reserve/reconcile |
| `gateway/` | The proxy endpoint itself — wires everything above together, plus the circuit breaker and idempotency cache |
| `billing/` | Stripe client, webhook signature verification + handler, invoice mirror, usage-billing job |
| `metrics/` | Prometheus `/metrics` |

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

**Recurring pattern: resolving an identity before any tenant context
exists.** Two places in this codebase have to look something up *before*
they know which tenant they're dealing with — authenticating a gateway
API key (`resolve_gateway_api_key`), and mapping a Stripe webhook's
customer id back to a tenant (`resolve_tenant_by_stripe_customer_id`).
Both go through a narrowly-scoped `SECURITY DEFINER` Postgres function
(owned by the migrator role, callable by `metergate_app`) that returns
only the specific fields needed for that lookup — never a general RLS
bypass. Once the tenant id is known, everything downstream goes through
the normal `runWithTenantContext` + `withTenantTransaction` path like any
other tenant-scoped operation.

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
