# @sweberdev/logarithm-react

## 0.5.1

### Patch Changes

- Updated dependencies [33e9ff4]
  - @sweberdev/logarithm@0.5.1

## 0.5.0

### Minor Changes

- 3a5048a: Add `@sweberdev/logarithm/testing` with a store conformance suite (`storeConformanceChecks`, `runStoreConformance`) so custom stores can prove they behave like the built-in ones. The viewer's colour contrast (WCAG AA, light and dark) is now verified by a test, and the docs gain guides for migrations, Drizzle and Prisma, a custom-store conformance chapter and an accessibility and theming section.

### Patch Changes

- Updated dependencies [3a5048a]
  - @sweberdev/logarithm@0.5.0

## 0.4.0

### Minor Changes

- 7fdbfab: French and Italian: built-in labels for `<AuditLog>` and `<ActivityFeed>`, and sentences in `describeAction()` for `fr` and `it` locales.

### Patch Changes

- Updated dependencies [7fdbfab]
  - @sweberdev/logarithm@0.4.0

## 0.3.0

### Minor Changes

- fd7a15d: - `audit.count(query)` returns the number of matching events with the same filters as `query`; `audit.count({ ...query, groupBy: "day" | "action" | "actor" })` returns counts per UTC day, action or actor. Memory, Postgres, SQLite and MySQL count in the database; custom stores without the new optional `count` method fall back to paging.
  - Typed action catalog: `createAuditLog<Actions>()` makes the compiler check action names, `action` filters (including `prefix.*`) and per-action metadata. Types only, no runtime cost; logs without a catalog behave as before.
  - New MySQL 8 / MariaDB 10.6+ store at `@sweberdev/logarithm/mysql` (`mysqlStore`, `migrateMysql`, `mysqlSchema`) for `mysql2`, `mariadb` or any driver with `query(sql, values)`.

### Patch Changes

- Updated dependencies [fd7a15d]
  - @sweberdev/logarithm@0.3.0

## 0.2.0

### Minor Changes

- efdcb67: Add `contextFromRequest()` to fill the request context (IP, browser, request id, location) from proxy headers, and `<ActivityFeed>`, a compact list of recent events with relative times for dashboards.

### Patch Changes

- Updated dependencies [efdcb67]
  - @sweberdev/logarithm@0.2.0

## 0.1.0

### Minor Changes

- 42401bc: First release: audit events with diffs and redaction, tenant-scoped queries, Postgres and SQLite stores, Fetch API handler and the React viewer.

### Patch Changes

- Updated dependencies [42401bc]
  - @sweberdev/logarithm@0.1.0
