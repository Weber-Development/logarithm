# @sweberdev/logarithm

Self-hosted audit log for SaaS apps: who changed what, and when. Field-level diffs with redaction of secrets, tenant-scoped queries with keyset paging, counts grouped by day, action or actor, typed action catalogs, Postgres, MySQL/MariaDB and SQLite stores, and a Fetch API handler for the [React viewer](https://www.npmjs.com/package/@sweberdev/logarithm-react).

```sh
npm i @sweberdev/logarithm
```

```ts
import { createAuditLog } from "@sweberdev/logarithm"
import { migratePostgres, postgresStore } from "@sweberdev/logarithm/postgres"

await migratePostgres({ client: pool })
const audit = createAuditLog({ store: postgresStore({ client: pool }) })

await audit.with({ tenantId: org.id, actor: { id: user.id, name: user.name } }).record({
  action: "project.updated",
  targets: [{ type: "project", id: project.id, name: project.name }],
  before: { name: "Website", plan: "free" },
  after: { name: "Website", plan: "pro" },
})

const { events, nextCursor } = await audit.query({ tenantId: org.id, action: "project.*" })
const total = await audit.count({ tenantId: org.id, action: "member.*" })
const perDay = await audit.count({ tenantId: org.id, groupBy: "day" }) // [{ key: "2026-10-05", count: 12 }, ...]
```

Typed actions, checked at compile time only:

```ts
type Actions = { "project.updated": {}; "invoice.paid": { amount: number; currency: string } }
const audit = createAuditLog<Actions>({ store })
await audit.record({ action: "invoice.paid", actor, metadata: { amount: 120, currency: "CHF" } })
```

SQLite: `import { sqliteStore, migrateSqlite } from "@sweberdev/logarithm/sqlite"` with `better-sqlite3`, `node:sqlite` or `bun:sqlite`.

MySQL 8 / MariaDB 10.6+: `import { mysqlStore, migrateMysql } from "@sweberdev/logarithm/mysql"` with `mysql2` or `mariadb`.

Documentation: [packages.sweber.dev/logarithm/docs](https://packages.sweber.dev/logarithm/docs)

MIT licensed.
