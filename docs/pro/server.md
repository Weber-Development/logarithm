---
title: Admin server
description: A ready-to-run admin view with search and export for your customers' admins, event ingest and anomaly alerts, as a Docker image or with Node.js.
---

`@weber-development/logarithm-server` is the finished version of what the free packages let you build: a page where an admin of one of your customers searches and filters their audit log and downloads it, plus alerts for you. You run it next to your app; your app keeps writing events as before.

It does four things:

- **Admin view.** The Logarithm viewer with search, filters, details and changes, and an export form (CSV, NDJSON, JSON, optionally for a period, actions or an actor). English and German.
- **One tenant per credential.** Every token, JWT or proxy login names exactly one tenant. The viewer, the export and the details of an event only ever show that tenant.
- **Ingest.** `POST /v1/events` writes events, so apps in any language can use it. A key belongs to a tenant, and a `tenantId` in the body is ignored.
- **Alerts.** Mass deletions, mass changes, exports, failed logins, off-hours permission changes and changes from a new IP are sent to Slack, Teams, a signed webhook or e-mail, and stored in the log. See [Alerts](alerts.md#more-rules-mass-changes-off-hours-new-ips).

## Run it

With Docker (the image is published with each Pro release):

```sh
docker run -p 3000:3000 \
  -e LOGARITHM_DATABASE_URL=postgres://user:pass@db:5432/app \
  -e LOGARITHM_ADMIN_TOKENS="acme=<long random token>,globex=<another one>" \
  -e LOGARITHM_INGEST_KEY=<long random key> \
  -e LOGARITHM_SLACK_WEBHOOK=https://hooks.slack.com/services/... \
  ghcr.io/weber-development/logarithm-server:latest
```

Or with Node.js 22.13 or newer:

```sh
npm install @weber-development/logarithm-server   # brings the Postgres and MySQL drivers; SQLite is built into Node.js
LOGARITHM_DATABASE_URL=postgres://... LOGARITHM_ADMIN_TOKEN=... npx logarithm-server
```

The server speaks plain HTTP on port 3000. Put it behind your reverse proxy with HTTPS. `GET /healthz` answers 200 while the process runs, `GET /readyz` also checks the database.

It reads the table of the free packages (`audit_events`, or `LOGARITHM_TABLE`). Run your `migrate*` function as usual, or start once with `LOGARITHM_AUTO_MIGRATE=true`.

## Signing in

| Mode | For | How it works |
|---|---|---|
| `token` (default) | Quick start, few customers | `LOGARITHM_ADMIN_TOKENS="acme=<token>,globex=<token>"`. You hand each customer admin their token; the viewer asks for it once per browser session. For one tenant: `LOGARITHM_ADMIN_TOKEN` and `LOGARITHM_TENANT` |
| `jwt` | Your app signs the admin in | `LOGARITHM_AUTH=jwt` and `LOGARITHM_JWT_SECRET` (32+ characters). The token is an HS256 JWT with `exp` (required), `sub` and a `tenant` claim (`LOGARITHM_JWT_TENANT_CLAIM` renames it). Only HS256 is accepted. `signJwt(claims, secret)` creates one |
| `proxy` | Your reverse proxy or identity provider does the login | `LOGARITHM_AUTH=proxy`. The proxy sets `x-forwarded-user` and (with `LOGARITHM_PROXY_TENANT_HEADER`) the tenant, and proves it is the proxy with `x-logarithm-proxy-secret: <LOGARITHM_PROXY_SECRET>`. Without the secret, nothing is accepted. A request without a tenant header is refused |

Tokens are compared in constant time. After 20 failed attempts in 10 minutes an address gets `429`. Behind a proxy set `LOGARITHM_TRUST_PROXY=true` so the limit counts the real caller. Use long random values (`openssl rand -hex 32`); the server refuses secrets shorter than 16 characters.

## Sending events

```sh
curl -X POST https://audit.example.com/v1/events \
  -H "authorization: Bearer $LOGARITHM_INGEST_KEY" -H "content-type: application/json" \
  -d '{"action":"project.updated","actor":{"id":"u_1","name":"Anna Muster"},
       "targets":[{"type":"project","id":"p_1"}],"before":{"name":"A"},"after":{"name":"B"}}'
```

The body is the same as `audit.record()` takes (`action`, `actor`, `targets`, `changes` or `before` and `after`, `context`, `metadata`, `outcome`, `correlationId`, `occurredAt`). Secrets such as passwords are redacted like everywhere else. Send up to 100 events as `{"events":[…]}`. Answers: `201 {"ids":[…]}`, `400` for an invalid event, `403` for a wrong key. Keys are set with `LOGARITHM_INGEST_KEY` or `LOGARITHM_INGEST_KEYS="acme=<key>,globex=<key>"`; without them ingest is off. If your app is written in TypeScript it is simpler to keep using `createAuditLog` directly; ingest is for everything else.

With `LOGARITHM_INTEGRITY_KEY` (32+ characters) the events written through the server join a [hash chain](integrity.md). Write through one server instance only, because the chain head is kept in memory.

## Alerts

Alerts run inside the server every `LOGARITHM_ALERT_INTERVAL_MINUTES` (default 5) and are on as soon as a target is set:

| Target | Settings |
|---|---|
| Slack | `LOGARITHM_SLACK_WEBHOOK` |
| Microsoft Teams | `LOGARITHM_TEAMS_WEBHOOK` |
| Signed webhook | `LOGARITHM_WEBHOOK_URL` and `LOGARITHM_WEBHOOK_SECRET`, verify with `verifyWebhook` |
| E-mail | `LOGARITHM_RESEND_API_KEY`, `LOGARITHM_ALERT_EMAIL_FROM`, `LOGARITHM_ALERT_EMAIL_TO` (comma-separated). Sent through [Resend](https://resend.com) |

`LOGARITHM_ALERT_RULES` chooses the rules: `extended` (default; the three defaults plus mass changes, off-hours and new-IP permission changes), `default` or `none`. Every alert is also stored as a `logarithm.anomaly_detected` event, so it shows in the viewer, and the same alert is not sent again while its window is open. Run one instance, otherwise every instance sends its own alert. Need other rules, thresholds or time zones? Embed the server in a small Node program, or run `detectAnomalies` yourself.

## Embedding

```ts
import { createApp, openStore, readConfig, serve, startAlerts } from "@weber-development/logarithm-server"

const config = readConfig(process.env)
const { store, ping } = await openStore(config)
const app = createApp({ config, store, ping })   // app.fetch(request) is a Fetch API handler
serve(app, config)
startAlerts({ store: app.writeStore, alerts: config.alerts })
```

## Good to know

- The viewer is one page that talks to `/api/audit`, `/api/export` and `/api/me`. Responses carry a strict content security policy.
- The server stores nothing but the audit log. It has no users of its own; credentials come from the environment, your app or your proxy.
- Not tested against live services: Postgres and MySQL through the server (the stores themselves are the tested code of the free package), e-mail through Resend, sign-in through a real identity provider behind the `proxy` mode, and pulling the image from ghcr.io as a customer. The SQLite path, tenant isolation, all three sign-in modes, ingest, export and the alerts are covered by tests, and the viewer was run in a browser.
