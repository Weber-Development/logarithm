# @sweberdev/logarithm

## 0.3.0

### Minor Changes

- fd7a15d: - `audit.count(query)` returns the number of matching events with the same filters as `query`; `audit.count({ ...query, groupBy: "day" | "action" | "actor" })` returns counts per UTC day, action or actor. Memory, Postgres, SQLite and MySQL count in the database; custom stores without the new optional `count` method fall back to paging.
  - Typed action catalog: `createAuditLog<Actions>()` makes the compiler check action names, `action` filters (including `prefix.*`) and per-action metadata. Types only, no runtime cost; logs without a catalog behave as before.
  - New MySQL 8 / MariaDB 10.6+ store at `@sweberdev/logarithm/mysql` (`mysqlStore`, `migrateMysql`, `mysqlSchema`) for `mysql2`, `mariadb` or any driver with `query(sql, values)`.

## 0.2.0

### Minor Changes

- efdcb67: Add `contextFromRequest()` to fill the request context (IP, browser, request id, location) from proxy headers, and `<ActivityFeed>`, a compact list of recent events with relative times for dashboards.

## 0.1.0

### Minor Changes

- 42401bc: First release: audit events with diffs and redaction, tenant-scoped queries, Postgres and SQLite stores, Fetch API handler and the React viewer.
