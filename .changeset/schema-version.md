---
"@sweberdev/logarithm": minor
"@sweberdev/logarithm-react": minor
---

Core: the table layout now has a version. The schema SQL and `migrate*` create a small `<table>_meta` table that records it, `postgresSchemaVersion()`, `mysqlSchemaVersion()` and `sqliteSchemaVersion()` read it, and `migrate*` throws a `SchemaVersionError` when the database was created by a newer release, for example after a rollback. `SCHEMA_VERSION` and `SchemaVersionError` are exported. Existing tables keep working: the next `migrate*` adds the meta table.
