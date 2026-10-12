---
"@sweberdev/logarithm": major
"@sweberdev/logarithm-react": major
---

Logarithm 2.0: audit evidence for auditors.

- Events record an `outcome` (`success`, `failure`, `denied`) and a `correlationId`; both can be filtered, also over HTTP and in `<AuditLog>`. Schema version 2: `migrate*` upgrades an existing table in place and keeps every event readable (`postgresUpgradeSchema`, `mysqlUpgradeSchema`, `sqliteUpgradeSchema` for your own migration tool).
- `toCloudEvent`/`fromCloudEvent` and `toOtelLogRecord`/`toOtlpLogs` map events to CloudEvents 1.0 and OpenTelemetry logs.
- Postgres partitioning by month or year: `migratePostgres({ partitioned: true })`, `ensurePartitions`, `listPartitions`, `detachPartitions`.
- React: `<ObjectHistory>` shows the changes of one object with a diff per change and a field filter; `<AuditLog>` marks failed and denied events and filters by result.
- Custom stores must save and filter the two new fields; the conformance suite checks it.
- Breaking: schema version 2, Node.js 22 or newer, new keys in `AuditLogLabels`. See docs/migrating-to-2.md.
