# @sweberdev/logarithm

## 0.6.0

### Minor Changes

- 60236f6: Core: the table layout now has a version. The schema SQL and `migrate*` create a small `<table>_meta` table that records it, `postgresSchemaVersion()`, `mysqlSchemaVersion()` and `sqliteSchemaVersion()` read it, and `migrate*` throws a `SchemaVersionError` when the database was created by a newer release, for example after a rollback. `SCHEMA_VERSION` and `SchemaVersionError` are exported. Existing tables keep working: the next `migrate*` adds the meta table.

  Deprecations ahead of the 1.0 API freeze: the undocumented helpers `DEFAULT_LIMIT`, `MAX_LIMIT`, `encodeCursor`, `decodeCursor`, `toStoreQuery`, `toStoreFilter`, `sortGroups` (core) and `relativeTime` (React) are marked `@deprecated` and will be removed from the public exports in 0.9. The API reference now lists what is supported.

## 0.5.1

### Patch Changes

- 33e9ff4: Security: redaction now matches sensitive field names regardless of case and of `_` and `-` separators, so `access_token`, `api_key`, `client-secret` and `Authorization` are no longer stored. Before, only the camelCase spellings in the default list were redacted. More names are redacted by default (`authorization`, `clientSecret`, `secretKey`, `passphrase`, `sessionToken`, `cookie`, `currentPassword`, `newPassword`, `oldPassword`, `passwordConfirmation`). Names you pass as `redact` are matched the same way.

## 0.5.0

### Minor Changes

- 3a5048a: Add `@sweberdev/logarithm/testing` with a store conformance suite (`storeConformanceChecks`, `runStoreConformance`) so custom stores can prove they behave like the built-in ones. The viewer's colour contrast (WCAG AA, light and dark) is now verified by a test, and the docs gain guides for migrations, Drizzle and Prisma, a custom-store conformance chapter and an accessibility and theming section.

## 0.4.0

### Minor Changes

- 7fdbfab: French and Italian: built-in labels for `<AuditLog>` and `<ActivityFeed>`, and sentences in `describeAction()` for `fr` and `it` locales.

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
