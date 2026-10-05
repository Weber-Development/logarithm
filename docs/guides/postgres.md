---
title: Postgres
description: Store events in Postgres, Neon or Supabase.
---

```ts
import { createAuditLog } from "@sweberdev/logarithm"
import { migratePostgres, postgresSchema, postgresStore } from "@sweberdev/logarithm/postgres"
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
await migratePostgres({ client: pool })
export const audit = createAuditLog({ store: postgresStore({ client: pool }) })
```

`client` is anything with a `query(text, values)` method that returns `{ rows }`: `pg.Pool`, `pg.Client`, `@neondatabase/serverless`, PGlite, or a small wrapper around your driver.

## Migrations

`migratePostgres` runs `CREATE TABLE IF NOT EXISTS` and creates the indexes. If you manage migrations with Drizzle, Prisma or Flyway, print the SQL once and add it to a migration:

```ts
console.log(postgresSchema({ table: "audit_events", schema: "audit" }))
```

## Table

| Column | Type | Content |
|---|---|---|
| `id` | `text` | ULID, sorts by creation time |
| `occurred_at` | `timestamptz` | When it happened |
| `tenant_id` | `text` | Customer organisation, or `NULL` |
| `action` | `text` | e.g. `project.updated` |
| `actor_id` | `text` | Copy of `actor.id` for fast filters |
| `actor`, `targets`, `changes`, `context`, `metadata` | `jsonb` | Event data |
| `search` | `text` | Lower-case text for search |

Indexes cover tenant + time, actor + time, action prefix and targets (GIN).

## Transactions

Pass the transaction's client so the event commits or rolls back together with the change:

```ts
const client = await pool.connect()
try {
  await client.query("BEGIN")
  await client.query("UPDATE projects SET name = $1 WHERE id = $2", [name, id])
  await createAuditLog({ store: postgresStore({ client }) }).record({ ... })
  await client.query("COMMIT")
} finally {
  client.release()
}
```

## Protect the table

Give your application role only `INSERT` and `SELECT` on the table, and run retention with a separate role. That way a bug or an injection cannot rewrite history. [Logarithm Pro](pro/integrity.md) adds a hash chain that makes changes visible even to someone with full database access.
