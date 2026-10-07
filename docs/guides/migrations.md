---
title: Migrations and upgrades
description: Create the audit table, keep it in your own migrations and upgrade safely.
---

The audit table is a single table with a fixed shape, and every `migrate*` function is idempotent: it uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`, so running it on every start is safe.

```ts
import { migratePostgres } from "@sweberdev/logarithm/postgres"

await migratePostgres({ client: pool, schema: "audit" }) // also migrateMysql, migrateSqlite
```

## Your own migration tool

Most teams want schema changes under version control. Every store exports a function that returns the SQL, so you can write it into a migration file once:

```ts
import { postgresSchema } from "@sweberdev/logarithm/postgres"

console.log(postgresSchema({ schema: "audit", table: "audit_events" }))
```

`mysqlSchema()` and `sqliteSchema()` work the same way. Copy the output into a migration of Drizzle Kit, Prisma (`prisma migrate dev --create-only`), Flyway, Atlas or plain SQL files, see [Drizzle and Prisma](drizzle-prisma.md).

## Upgrading Logarithm

The table layout has not changed since 0.1: new versions work with the table that an older version created. If a future release changes it, the release notes say so, and re-running `migrate*` or your regenerated schema SQL applies it.

Since 0.6 the layout has a version number. The schema SQL creates a small table `<table>_meta` (default `audit_events_meta`) with one row, `schema_version`. Read it with `postgresSchemaVersion()`, `mysqlSchemaVersion()` or `sqliteSchemaVersion()`; it returns `null` when the tables were created by an older release, and `SCHEMA_VERSION` (exported by `@sweberdev/logarithm`) is the version this release creates.

`migrate*` throws a `SchemaVersionError` when the database has a newer version than the code knows. That protects you from running an old deployment against a table that a newer release has changed, for example during a rollback. Update Logarithm instead of ignoring the error. If you copy the schema SQL into your own migration tool, include the `_meta` statements it prints, so the version is recorded there too.

## Large tables

Create the table and indexes before you have data. On an existing table with millions of rows, build indexes yourself with your database's online option, for example `CREATE INDEX CONCURRENTLY` on Postgres, and keep the same index names that `postgresSchema()` prints so `IF NOT EXISTS` skips them later.

## Partitioning and archiving

Audit logs only grow. Plan retention early: Logarithm Pro deletes by time per tenant and archives to S3 or Cloudflare R2 first, see [Retention and privacy](../pro/retention.md). Postgres users with very high volumes can partition the table by `occurred_at` in their own migration. The store works unchanged on a partitioned table as long as the column names stay the same.
