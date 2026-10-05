# Logarithm

Self-hosted audit log for SaaS apps: who changed what, and when. Record events with field-level diffs in your own Postgres or SQLite database, and give your customers' admins a ready-made activity view in React.

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
| [`@sweberdev/logarithm`](packages/core) | `createAuditLog`, diff with redaction of secrets, tenant-scoped queries, memory, Postgres and SQLite stores, Fetch API handler |
| [`@sweberdev/logarithm-react`](packages/react) | `<AuditLog>` view with filters, day groups, diffs and paging; `useAuditLog` hook |

**Documentation:** [packages.sweber.dev/logarithm/docs](https://packages.sweber.dev/logarithm/docs) · **Demo:** [packages.sweber.dev/logarithm/demo](https://packages.sweber.dev/logarithm/demo)

## Why

- **Your database, your data.** No external service. Postgres 13+ (also Neon, Supabase) and SQLite (`better-sqlite3`, `node:sqlite`, Bun).
- **Multi-tenant by default.** A log scoped with `audit.with({ tenantId })` cannot read other tenants.
- **Safe diffs.** Passwords, tokens, API keys and card numbers are stored as `[redacted]`, also inside nested objects.
- **Runs anywhere.** The core uses Web APIs only: Node 20+, Bun, Deno, Cloudflare Workers.

## Logarithm Pro

Tamper evidence with an HMAC hash chain, retention periods with archiving, GDPR/FADP erasure and access requests, CSV export, and forwarding to Splunk, Datadog or signed webhooks. See [packages.sweber.dev/logarithm](https://packages.sweber.dev/logarithm).

## Development

```sh
pnpm install
pnpm build && pnpm test
pnpm lint
```

Changes need a changeset (`pnpm changeset`). Merging the "version packages" PR publishes to npm.

## License

MIT
