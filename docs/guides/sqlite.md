---
title: SQLite
description: Store events in SQLite with better-sqlite3, node:sqlite or Bun.
---

```ts
import Database from "better-sqlite3"
import { createAuditLog } from "@sweberdev/logarithm"
import { migrateSqlite, sqliteStore } from "@sweberdev/logarithm/sqlite"

const db = new Database("app.db")
migrateSqlite({ db })
export const audit = createAuditLog({ store: sqliteStore({ db }) })
```

`db` can also be `new DatabaseSync(path)` from `node:sqlite` (Node 22.13+) or `new Database(path)` from `bun:sqlite`. SQLite 3.38 or newer is needed for the JSON functions.

Timestamps are stored as ISO text in UTC, which sorts correctly. JSON columns are stored as text. `sqliteSchema()` returns the SQL if you prefer your own migrations.

SQLite suits single-server apps, desktop apps with Electron or Tauri, and tests. For several app servers writing at once, use Postgres.
