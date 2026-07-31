# Metergate

An AI usage metering & billing gateway — a proxy that sits in front of LLM
provider APIs (OpenAI, Anthropic), meters every call, and turns that usage
into real, Stripe-backed billing.

## The problem

Once an AI feature ships, the questions that actually matter are operational
ones: how much did this cost, who used it, is any tenant about to blow
through their budget, and how do you bill for consumption that varies call
to call? Most AI demo projects skip straight past this. Metergate is built
around it.

## What it does

- **Proxies calls to OpenAI/Anthropic** on behalf of a tenant, using the
  tenant's own API key (BYOK) — the gateway never holds provider credit.
- **Meters every call**: input/output tokens, latency, and a cost figure
  resolved against a versioned pricing table (so a price update never
  rewrites historical billing).
- **Attributes cost** by tenant, project, and an arbitrary `feature` tag the
  caller passes in — the same idea as Stripe's `metadata`, applied to LLM
  spend instead of payments.
- **Enforces budgets and rate limits in real time** via Redis, using the
  same reserve-then-reconcile pattern a payment authorization hold uses:
  optimistically reserve the estimated cost before the call, true it up
  against the real cost after.
- **Bills through Stripe** (test mode) using the modern Meters API —
  usage becomes a real invoice, not a simulated one.
- **Never double-counts.** Idempotency keys prevent a retried request from
  being metered or billed twice; partial/streamed responses are billed for
  exactly what was delivered, not what was requested.

## Why BYOK

The gateway emits its own API keys to tenants (`sk-mg-...`), but tenants
supply their own OpenAI/Anthropic credentials, encrypted at rest. This
removes the financial risk of fronting provider credit while keeping every
interesting engineering problem — metering, attribution, limits, billing —
fully intact. The "platform holds the credit" model is deliberately
scoped out; see `CLAUDE.md` for the full list of what's out of scope and
why.

## Architecture

```
apps/api/     NestJS — gateway proxy, metering, budgets, Stripe billing
apps/web/     Next.js — usage & billing dashboard
packages/shared/  zod schemas shared between api and web
```

Postgres enforces tenant isolation with row-level security; the app
connects as an unprivileged role that cannot bypass it. Redis holds
real-time rate-limit and budget counters, with Postgres as the durable
source of truth a reconciliation job corrects against.

## Running locally

Requires Docker. Nothing runs on the host directly.

```bash
cp .env.example .env
docker compose up
```

- API: http://localhost:3000
- Dashboard: http://localhost:3001

Run migrations and tests inside the containers:

```bash
docker compose exec api npm run migrate:up
docker compose exec api npm test
docker compose exec api npm run test:integration
```

## Status

Early stage — foundation and schema are in place; the gateway proxy,
budget enforcement, and Stripe billing integration are in progress. See
`CLAUDE.md` for the full architecture and scope decisions.
