---
"@sweberdev/logarithm": minor
"@sweberdev/logarithm-react": minor
---

- `audit.count(query)` returns the number of matching events with the same filters as `query`; `audit.count({ ...query, groupBy: "day" | "action" | "actor" })` returns counts per UTC day, action or actor. Memory, Postgres, SQLite and MySQL count in the database; custom stores without the new optional `count` method fall back to paging.
- Typed action catalog: `createAuditLog<Actions>()` makes the compiler check action names, `action` filters (including `prefix.*`) and per-action metadata. Types only, no runtime cost; logs without a catalog behave as before.
- New MySQL 8 / MariaDB 10.6+ store at `@sweberdev/logarithm/mysql` (`mysqlStore`, `migrateMysql`, `mysqlSchema`) for `mysql2`, `mariadb` or any driver with `query(sql, values)`.
