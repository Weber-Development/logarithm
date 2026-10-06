---
title: Drizzle and Prisma
description: Use Logarithm next to Drizzle ORM or Prisma, with your existing database connection.
---

Logarithm talks to the database through a small client interface, not through an ORM, so it works next to any ORM. The audit table is managed by Logarithm, and your ORM keeps managing the rest.

## Drizzle ORM

Drizzle's node-postgres and postgres-js drivers wrap a pool. Use the same pool for Logarithm:

```ts
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import { createAuditLog } from "@sweberdev/logarithm"
import { migratePostgres, postgresStore } from "@sweberdev/logarithm/postgres"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const db = drizzle(pool)

await migratePostgres({ client: pool })
export const audit = createAuditLog({ store: postgresStore({ client: pool }) })
```

To keep the table in Drizzle's migration history, generate an empty migration with `drizzle-kit generate --custom --name audit_log` and paste the output of `postgresSchema()` into the file. Drizzle then applies it with your other migrations, and you do not need to call `migratePostgres`.

## Prisma

Prisma Client does not expose a raw `query(sql, values)` method, so give Logarithm the underlying `pg` pool (Prisma needs a connection string anyway) or use Prisma's driver adapter:

```ts
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"
import { createAuditLog } from "@sweberdev/logarithm"
import { postgresStore } from "@sweberdev/logarithm/postgres"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
export const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
export const audit = createAuditLog({ store: postgresStore({ client: pool }) })
```

To keep the table in Prisma's migrations, run `prisma migrate dev --create-only --name audit_log`, paste `postgresSchema()` into the generated `migration.sql`, then `prisma migrate dev`. Do not model the audit table in `schema.prisma`; Prisma would try to manage it.

## Recording the change and the audit entry together

`record()` takes `before` and `after` objects, so the usual pattern is to read the row, update it and record the diff:

```ts
const before = await prisma.project.findUniqueOrThrow({ where: { id } })
const after = await prisma.project.update({ where: { id }, data })
await audit.record({
  action: "project.updated",
  actor: { id: session.userId },
  targets: [{ type: "project", id, name: after.name }],
  before,
  after,
})
```
