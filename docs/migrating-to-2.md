---
title: Migrating to 2.0
description: What changed in Logarithm 2.0 and how to upgrade from 1.x.
---

Logarithm 2.0 gives every event an outcome and a correlation id, maps events to CloudEvents and OpenTelemetry, partitions large Postgres tables and shows the history of one object. Most apps upgrade by running the migration once. This page lists everything that can break.

The 1.x line gets security and bug fixes for 12 months after the release of 2.0.0.

## Upgrade in four steps

1. **Node.js 22 or newer.** Node 20 reached end of life; `engines` now says `>=22`.
2. **Update both packages together:** `npm install @sweberdev/logarithm@2 @sweberdev/logarithm-react@2`. If you use Logarithm Pro, update `@weber-development/logarithm-export`, `-integrity` and `-retention` to 2 as well.
3. **Run the migration.** `migratePostgres`, `migrateMysql` and `migrateSqlite` add the two new columns to an existing table, keep every event and set the schema version to 2. They are idempotent and safe to run on every start. If you keep migrations in your own tool, use `postgresUpgradeSchema()`, `mysqlUpgradeSchema()` or `sqliteUpgradeSchema()` and update `<table>_meta` ([Migrations](guides/migrations.md)).
4. **Deploy.** Roll out the code after the migration. While old code runs against the upgraded table it keeps working, because the new columns are nullable; the other way round, new code on an old table fails until you migrate.

A rollback to 1.x after the migration is possible as long as you did not write events with 2.0 that the old version should read: 1.x ignores the new columns. 1.x refuses to migrate a table of schema version 2 (`SchemaVersionError`), which is by design.

## What changed

| Change | Who is affected | What to do |
|---|---|---|
| Schema version 2: `outcome` and `correlation_id` columns | Everybody | Run the migration |
| `record()` stores `outcome` (default `success`) | Code that compares stored events field by field | Expect the new field; old events have none |
| `AuditQuery`, `StoreQuery` and the HTTP endpoint accept `outcome` and `correlationId` | Custom stores | Save and return both, filter by both, see below |
| Node.js 22+, ES2022 build target | Node 20 users | Upgrade Node |
| `AuditLogLabels` has new keys (result filter, history) | Anyone who passes a complete label set typed as `AuditLogLabels` | Add the keys, or pass `Partial<AuditLogLabels>` as before |

Nothing else was removed. The helpers that were deprecated in 0.6 and removed in 0.8 stay removed.

### Events from before 2.0

They keep their shape: no `outcome`, no `correlationId`. A filter `outcome: "success"` matches them, `failure` and `denied` do not. The hash chain of Logarithm Pro is not affected, see below.

### Custom stores

Your `AuditStore` has to persist `outcome` and `correlationId`, return them from `query` and `get`, and apply the two new filters in `query` and `count`. A filter `outcome: "success"` must also match events without an outcome. The helper `matches(event, query)` is the reference. Run the conformance suite (`@sweberdev/logarithm/testing`); its new check "stores the outcome and correlation id" fails until your store does all of this.

### Logarithm Pro

- Pro 2.0 includes `outcome` and `correlationId` in the hash of new events. Events without them hash exactly as before, so a chain written with 1.x verifies with 2.0, and a chain that mixes both verifies too. A test with 1.x data is part of the Pro test suite.
- Pro 1.x keeps working with free 2.0: the Pro packages do not depend on the free package, so there is no peer range to satisfy. A chain written by Pro 1.x verifies unchanged.
- To use the new Pro features (auditor access, control mapping) update the Pro packages to 2.

## What is new

- [Outcome and correlation id](guides/recording.md#outcome-and-correlation-id)
- [Export formats](guides/formats.md): CloudEvents and OpenTelemetry
- [Partitioning](guides/partitioning.md) for large Postgres tables
- [`<ObjectHistory>`](guides/react.md#history-of-one-object) and a result filter in `<AuditLog>`

## Trying the release candidate

Release candidates are published under the npm tag `next`: `npm install @sweberdev/logarithm@next @sweberdev/logarithm-react@next`. Please test the migration on a copy of your database and tell us what you find: [github.com/Weber-Development/logarithm/issues](https://github.com/Weber-Development/logarithm/issues).
