---
title: API
description: Functions and types of @sweberdev/logarithm.
---

## `createAuditLog<Actions>(options)`

| Option | Type | Meaning |
|---|---|---|
| `store` | `AuditStore` | Where events are stored |
| `redact` | `string[]` | Field names stored as `[redacted]`. Default `DEFAULT_REDACT` |
| `ignore` | `string[]` | Dot paths left out of computed diffs |
| `defaults` | `AuditDefaults` | Tenant, actor, context and metadata for every event |
| `now` | `() => Date` | Clock, for tests |

Returns an `AuditLog`:

| Method | Returns |
|---|---|
| `record(input)` | `Promise<AuditEvent>` |
| `recordMany(inputs)` | `Promise<AuditEvent[]>`, one write |
| `query(query?)` | `Promise<AuditPage>`, newest first |
| `count(query?)` | `Promise<number>`, the number of matching events |
| `count({ ...query, groupBy })` | `Promise<AuditGroupCount[]>`, counts per day, action or actor |
| `get(id)` | `Promise<AuditEvent \| null>` |
| `with(defaults)` | A scoped `AuditLog` |

Invalid input throws `AuditValidationError`; invalid queries throw `AuditQueryError`.

`Actions` is an optional [action catalog](../guides/recording.md#typed-actions). Without it, any action name and any metadata are accepted, as before.

## `count(query)`

Takes the same filters as `query` (`tenantId`, `actorId`, `action`, `targetId`, `targetType`, `from`, `to`, `search`), without `limit` and `cursor`. A log scoped with `with({ tenantId })` counts only that tenant.

```ts
await audit.count({ tenantId: org.id, action: "member.*", from: "2026-10-01" }) // 42

await audit.count({ tenantId: org.id, groupBy: "day" })
// [{ key: "2026-10-01", count: 12 }, { key: "2026-10-02", count: 30 }]
```

| `groupBy` | `key` | Order |
|---|---|---|
| `"day"` | UTC day, `YYYY-MM-DD` | Oldest first; days without events are left out |
| `"action"` | Action name | Most frequent first, then by name |
| `"actor"` | Actor id | Most frequent first, then by id |

The built-in stores count in the database. A [custom store](custom-store.md) without `count` still works: the log pages through `query` instead.

## `AuditQuery`

| Field | Meaning |
|---|---|
| `tenantId` | Tenant, or `null` for events without one |
| `actorId` | Exact actor id |
| `action` | Exact action or `prefix.*`; an array means OR |
| `targetId`, `targetType` | Event has a target with this id or type |
| `from`, `to` | Time range, `from` inclusive, `to` exclusive |
| `search` | Case-insensitive text in action, actor and targets |
| `limit` | 1 to 500, default 50 |
| `cursor` | `nextCursor` of the previous page |

## `AuditEvent`

```ts
interface AuditEvent {
  id: string                 // ULID
  occurredAt: string         // ISO 8601, UTC
  tenantId: string | null
  action: string
  actor: { id: string; type?: string; name?: string; email?: string }
  targets: { id: string; type: string; name?: string }[]
  changes: { field: string; before?: unknown; after?: unknown }[]
  context: { ip?: string; userAgent?: string; requestId?: string; location?: string }
  metadata: Record<string, unknown>
}
```

## Helpers

| Function | Meaning |
|---|---|
| `contextFromRequest(request, { trustProxy })` | IP, browser, request id and location from a `Request` or `Headers` |
| `diff(before, after, options?)` | Field changes with redaction |
| `describeAction(event, { locale, nouns })` | Short sentence such as `updated project "Website"` |
| `memoryStore()` | In-memory store for tests and demos |
| `ulid()` | Time-sortable id |

## Subpaths

| Import | Exports |
|---|---|
| `@sweberdev/logarithm/postgres` | `postgresStore`, `migratePostgres`, `postgresSchema` |
| `@sweberdev/logarithm/sqlite` | `sqliteStore`, `migrateSqlite`, `sqliteSchema` |
| `@sweberdev/logarithm/mysql` | `mysqlStore`, `migrateMysql`, `mysqlSchema` (MySQL 8+, MariaDB 10.6+) |
| `@sweberdev/logarithm/testing` | `storeConformanceChecks`, `runStoreConformance`, `ConformanceError` for your own stores |
