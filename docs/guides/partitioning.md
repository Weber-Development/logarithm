---
title: Partitioning
description: Keep very large Postgres audit tables fast and make retention instant.
---

An audit table only grows. Up to a few hundred million rows the default table with its indexes is fine (see [Performance](performance.md)). Beyond that, partition it by month: queries for a time range read only the partitions they need, indexes stay small, and removing a month of old events becomes a metadata operation instead of a long `DELETE`.

## Create a partitioned table

```ts
import { migratePostgres, ensurePartitions } from "@sweberdev/logarithm/postgres"

await migratePostgres({ client: pool, partitioned: true })
await ensurePartitions({ client: pool, from: new Date(), to: "2027-03-31" })
```

`partitioned: true` creates the table with `PARTITION BY RANGE (occurred_at)`, a primary key of `(occurred_at, id)` and a **default partition** (`audit_events_default`). Events outside every partition you created land in the default partition, so a late job never loses an event. `postgresSchema({ partitioned: true })` prints the SQL for your own migration tool.

`ensurePartitions` creates one partition per month (or per year with `interval: "year"`) covering `from` to `to`, skips the ones that exist and returns the names it created, for example `audit_events_p2026_10`. Run it from a daily or monthly job, three months ahead. Bounds are UTC.

If the default partition already holds events inside a range you want to create, Postgres refuses the new partition. Create partitions ahead of time to avoid this, or move those rows into the new table first.

## Archive and remove old months

```ts
import { detachPartitions } from "@sweberdev/logarithm/postgres"

const old = await detachPartitions({ client: pool, olderThan: "2025-10-01" })
// old: [{ name: "audit_events_p2025_08", from: "...", to: "..." }, ...]
```

`detachPartitions` detaches every partition whose range ends on or before `olderThan`. The detached tables keep their data and become ordinary tables: write them to your archive (`COPY audit_events_p2025_08 TO ...`, `pg_dump`, or the S3 archive of [Logarithm Pro](../pro/retention.md)), check the file, then `DROP TABLE`. Pass `drop: true` only once the archive is safe. `listPartitions` shows what exists.

Removing the oldest months is fine for the hash chain of [Logarithm Pro](../pro/integrity.md#works-with-retention-and-erasure): the chain then starts at a later position. Take a checkpoint before you detach, so you keep proof of the chain head.

## Move an existing table

An existing table cannot be converted in place. Create the partitioned table under a new name, copy, and swap:

```sql
-- 1. create audit_events_new with migratePostgres({ table: "audit_events_new", partitioned: true })
-- 2. ensurePartitions({ table: "audit_events_new", from: <oldest event>, to: <next quarter> })
INSERT INTO audit_events_new SELECT * FROM audit_events;
-- 3. in one transaction:
ALTER TABLE audit_events RENAME TO audit_events_old;
ALTER TABLE audit_events_new RENAME TO audit_events;
```

Stop writing (or record into both) for the moment of the swap. Rename the `_meta` table and indexes if your tooling expects the original names.

## Good to know

- The store works unchanged on a partitioned table: `query`, `count`, `get`, `deleteBefore` and `rewriteActor` use the same SQL. `deleteBefore` still deletes row by row; prefer `detachPartitions` for bulk retention.
- Uniqueness of `id` is guaranteed by the ULID, not by the database, because Postgres requires the partition key in the primary key. A plain index on `id` keeps `get(id)` fast.
- Partitioning needs Postgres 13 or newer; the conformance suite and the tests run against Postgres 16.
