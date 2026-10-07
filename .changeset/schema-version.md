---
"@sweberdev/logarithm": minor
"@sweberdev/logarithm-react": minor
---

Core: the table layout now has a version. The schema SQL and `migrate*` create a small `<table>_meta` table that records it, `postgresSchemaVersion()`, `mysqlSchemaVersion()` and `sqliteSchemaVersion()` read it, and `migrate*` throws a `SchemaVersionError` when the database was created by a newer release, for example after a rollback. `SCHEMA_VERSION` and `SchemaVersionError` are exported. Existing tables keep working: the next `migrate*` adds the meta table.

Deprecations ahead of the 1.0 API freeze: the undocumented helpers `DEFAULT_LIMIT`, `MAX_LIMIT`, `encodeCursor`, `decodeCursor`, `toStoreQuery`, `toStoreFilter`, `sortGroups` (core) and `relativeTime` (React) are marked `@deprecated` and will be removed from the public exports in 0.9. The API reference now lists what is supported.
