---
title: API
description: Functions and types of @sweberdev/logarithm.
---

## `createAuditLog(options)`

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
| `get(id)` | `Promise<AuditEvent \| null>` |
| `with(defaults)` | A scoped `AuditLog` |

Invalid input throws `AuditValidationError`; invalid queries throw `AuditQueryError`.

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
| `diff(before, after, options?)` | Field changes with redaction |
| `describeAction(event, { locale, nouns })` | Short sentence such as `updated project "Website"` |
| `memoryStore()` | In-memory store for tests and demos |
| `ulid()` | Time-sortable id |

## Subpaths

| Import | Exports |
|---|---|
| `@sweberdev/logarithm/postgres` | `postgresStore`, `migratePostgres`, `postgresSchema` |
| `@sweberdev/logarithm/sqlite` | `sqliteStore`, `migrateSqlite`, `sqliteSchema` |
