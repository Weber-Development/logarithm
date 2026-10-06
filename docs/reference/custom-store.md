---
title: Custom store
description: Use another database by implementing AuditStore.
---

```ts
interface AuditStore {
  insert(events: AuditEvent[]): Promise<void>
  query(query: StoreQuery): Promise<AuditEvent[]>
  get(id: string): Promise<AuditEvent | null>
  count?(query: StoreFilter, groupBy?: AuditGroupBy): Promise<AuditGroupCount[]>
  deleteBefore?(before: string, tenantId?: string | null): Promise<number>
  rewriteActor?(actorId: string, actor: AuditActor): Promise<number>
}
```

`query` receives a validated `StoreQuery` and must return at most `limit` events ordered by `occurredAt` descending, then `id` descending. `before` is the keyset position for paging: return only events strictly older than `(occurredAt, id)`.

The functions `matches(event, query)` and `compareEvents(a, b)` from the core package are the reference semantics; the test suite of the built-in stores runs the same cases against memory, SQLite, Postgres, MySQL and MariaDB.

`count` is optional. It receives the same filters as `query` without `limit` and `before`, and returns one `{ key, count }` per group (`key` is the UTC day `YYYY-MM-DD`, the action or the actor id) in any order, or a single `{ key: "", count }` without `groupBy`. Without it, `audit.count()` pages through `query`, which is correct but slower. `countEvents(events, filter, groupBy)` is the reference implementation.

`deleteBefore` and `rewriteActor` are optional; retention and erasure in Logarithm Pro need them.
