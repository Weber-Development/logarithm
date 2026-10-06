---
title: MySQL and MariaDB
description: Store events in MySQL 8 or MariaDB 10.6+ with mysql2, mariadb or any driver.
---

```ts
import { createAuditLog } from "@sweberdev/logarithm"
import { migrateMysql, mysqlStore } from "@sweberdev/logarithm/mysql"
import mysql from "mysql2/promise"

const pool = mysql.createPool(process.env.DATABASE_URL!)
await migrateMysql({ client: pool })
export const audit = createAuditLog({ store: mysqlStore({ client: pool }) })
```

`client` is anything with a `query(sql, values)` method: a `mysql2/promise` pool or connection, a `mariadb` pool or connection, or a small wrapper around your driver that resolves to `{ rows }` (and `{ affectedRows }` for deletes). PlanetScale and other MySQL-compatible services work the same way.

## Migrations

`migrateMysql` runs `CREATE TABLE IF NOT EXISTS` with the indexes. For Drizzle, Prisma, Flyway or Liquibase, print the SQL once and add it to a migration:

```ts
console.log(mysqlSchema({ table: "audit_events", database: "audit" }))
```

## Table

| Column | Type | Content |
|---|---|---|
| `id` | `VARCHAR(64)` | ULID, sorts by creation time |
| `occurred_at` | `DATETIME(3)` | When it happened, in UTC |
| `tenant_id` | `VARCHAR(191)` | Customer organisation, or `NULL` |
| `action` | `VARCHAR(200)` | e.g. `project.updated` |
| `actor_id` | `VARCHAR(191)` | Copy of `actor.id` for fast filters |
| `actor`, `targets`, `changes`, `context`, `metadata` | `JSON` | Event data |
| `search` | `TEXT` | Lower-case text for search |

The table uses `utf8mb4_bin`, so ids, actions and tenants compare exactly, as in Postgres and SQLite. Timestamps are written and read as UTC text, so the connection's time zone and the driver's `timezone` option do not matter.

## Transactions

Pass a connection inside a transaction so the event commits or rolls back together with the change:

```ts
const conn = await pool.getConnection()
try {
  await conn.beginTransaction()
  await conn.query("UPDATE projects SET name = ? WHERE id = ?", [name, id])
  await createAuditLog({ store: mysqlStore({ client: conn }) }).record({ ... })
  await conn.commit()
} catch (error) {
  await conn.rollback()
  throw error
} finally {
  conn.release()
}
```

## Protect the table

Grant your application user only `INSERT` and `SELECT` on the table and run retention with a separate user. [Logarithm Pro](../pro/integrity.md) adds a hash chain that makes changes visible even to someone with full database access.
