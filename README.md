# Logarithm

Self-hosted audit log for SaaS apps: who changed what, and when. Record events with field-level diffs in your own Postgres, MySQL/MariaDB or SQLite database, and give your customers' admins a ready-made activity view in React.

```ts
await audit.record({
  tenantId: org.id,
  action: "project.updated",
  actor: { id: user.id, name: user.name },
  targets: [{ type: "project", id: project.id, name: project.name }],
  before: project,
  after: updated,
})
```

```tsx
<AuditLog endpoint="/api/audit" locale="de-CH" />
```

| Package | What it does |
|---|---|
| [`@sweberdev/logarithm`](packages/core) | `createAuditLog`, diff with redaction of secrets, tenant-scoped queries and counts, typed action catalogs, memory, Postgres, MySQL/MariaDB and SQLite stores, Fetch API handler |
| [`@sweberdev/logarithm-react`](packages/react) | `<AuditLog>` view with filters, day groups, diffs and paging; `useAuditLog` hook |

**Documentation:** [packages.sweber.dev/logarithm/docs](https://packages.sweber.dev/logarithm/docs) · **Demo:** [packages.sweber.dev/logarithm/demo](https://packages.sweber.dev/logarithm/demo)

## Why

- **Your database, your data.** No external service. Postgres 13+ (also Neon, Supabase), MySQL 8+ and MariaDB 10.6+ (`mysql2`, `mariadb`), and SQLite (`better-sqlite3`, `node:sqlite`, Bun).
- **Typed actions.** `createAuditLog<Actions>()` makes the compiler check action names, filters and per-action metadata, at zero runtime cost.
- **Counts for dashboards.** `audit.count({ action: "member.*", groupBy: "day" })` on every store.
- **Multi-tenant by default.** A log scoped with `audit.with({ tenantId })` cannot read other tenants.
- **Safe diffs.** Passwords, tokens, API keys and card numbers are stored as `[redacted]`, also inside nested objects.
- **Runs anywhere.** The core uses Web APIs only: Node 22+, Bun, Deno, Cloudflare Workers.

## Writing without JavaScript

The audit table is a plain Postgres table, so a service in Python, PHP or Go can insert events with SQL while a Node app reads them with `createAuditLog` and `<AuditLog>`. The layout is **schema version 2** (Logarithm 2.0 and later); its version is stored in `audit_events_meta`.

```python
conn.execute(
    """INSERT INTO audit_events (id, occurred_at, tenant_id, action, actor_id, actor, targets, outcome, search)
       VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s)""",
    (ulid(ms), occurred_at, "org_42", "document.read", "user_7",
     '{"id":"user_7","type":"user"}', '[{"id":"doc_9","type":"document"}]', "success",
     "document.read user_7 document doc_9"),
)
```

A direct writer takes over what `record()` does: validate the action, create a ULID, write whole milliseconds, fill `search` and keep secrets out of `changes` and `metadata`. [Writing without JavaScript](https://packages.sweber.dev/logarithm/docs/guides/writing-without-javascript) has the rules and a complete Python example. Check `schema_version` when your service starts, so a future layout change stops it instead of writing rows in the old layout.

## Logarithm Pro

Tamper evidence with an HMAC hash chain, retention periods with archiving, GDPR/FADP erasure and access requests, CSV export, forwarding to Splunk, Datadog or signed webhooks, Slack and Microsoft Teams alerts, and anomaly detection for exports, deletions and failed logins. See [packages.sweber.dev/logarithm](https://packages.sweber.dev/logarithm).

## Development

```sh
pnpm install
pnpm build && pnpm test
pnpm lint
```

Changes need a changeset (`pnpm changeset`). Merging the "version packages" PR publishes to npm.

## License

MIT

<!-- pro-promo -->
## Logarithm Pro

Need more than the free package? **Logarithm Pro** adds:

- Integrity: HMAC hash chain per tenant and a verifier that shows which event was changed, removed or reordered
- Retention: periods per customer, archiving, erasure with a stable pseudonym, access-request export
- Export: CSV, NDJSON and JSON streams, Splunk and Datadog forwarding, SOC 2 / ISO 27001 evidence packs

Subscriptions from CHF 29 per month, or a one-time lifetime licence. [See what is included](https://packages.sweber.dev/logarithm?utm_source=npm&utm_medium=readme&utm_campaign=pro)
