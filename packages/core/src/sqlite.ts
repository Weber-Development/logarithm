import { buildWhere, fromRow, identifier, type Row, toRow } from "./sql";
import type { AuditActor, AuditStore } from "./types";

interface Statement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

/**
 * A synchronous SQLite connection: `better-sqlite3`, `node:sqlite` (`DatabaseSync`) or
 * `bun:sqlite`. Needs SQLite 3.38 or newer for the JSON functions.
 */
export interface SqliteDatabase {
  prepare(sql: string): Statement;
  exec(sql: string): unknown;
}

export interface SqliteStoreOptions {
  db: SqliteDatabase;
  /** Default `audit_events`. */
  table?: string;
}

/** The `CREATE TABLE` statements, to run yourself or to copy into your migration tool. */
export function sqliteSchema(options: { table?: string } = {}): string {
  const name = options.table ?? "audit_events";
  const table = identifier(name);
  const index = (suffix: string) => identifier(`${name}_${suffix}`);
  return `CREATE TABLE IF NOT EXISTS ${table} (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  tenant_id TEXT,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  targets TEXT NOT NULL DEFAULT '[]',
  changes TEXT NOT NULL DEFAULT '[]',
  context TEXT NOT NULL DEFAULT '{}',
  metadata TEXT NOT NULL DEFAULT '{}',
  search TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ${index("tenant_time")} ON ${table} (tenant_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ${index("actor_time")} ON ${table} (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ${index("action")} ON ${table} (action);`;
}

/** Creates the table and indexes if they do not exist yet. */
export function migrateSqlite(options: SqliteStoreOptions): void {
  options.db.exec(sqliteSchema(options));
}

const COLUMNS =
  "id, occurred_at, tenant_id, action, actor_id, actor, targets, changes, context, metadata";

/**
 * Stores events in SQLite. Timestamps are stored as ISO 8601 text in UTC, which sorts correctly.
 * Run {@link migrateSqlite} once before use.
 */
export function sqliteStore(options: SqliteStoreOptions): AuditStore {
  const { db } = options;
  const table = identifier(options.table ?? "audit_events");
  const insert = db.prepare(
    `INSERT INTO ${table} (${COLUMNS}, search) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const transaction = <T>(fn: () => T): T => {
    db.exec("BEGIN");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };

  return {
    async insert(events) {
      transaction(() => {
        for (const event of events) {
          const r = toRow(event);
          insert.run(
            r.id,
            r.occurred_at,
            r.tenant_id,
            r.action,
            r.actor_id,
            r.actor,
            r.targets,
            r.changes,
            r.context,
            r.metadata,
            r.search,
          );
        }
      });
    },

    async query(q) {
      const where = buildWhere(q, {
        param: () => "?",
        time: (p) => p,
        targetHas: (field, p) =>
          `EXISTS (SELECT 1 FROM json_each(targets) WHERE json_extract(value, '$.${field}') = ${p})`,
      });
      const rows = db
        .prepare(
          `SELECT ${COLUMNS} FROM ${table} ${where.sql} ORDER BY occurred_at DESC, id DESC LIMIT ?`,
        )
        .all(...where.params, q.limit) as Row[];
      return rows.map(fromRow);
    },

    async get(id) {
      const rows = db.prepare(`SELECT ${COLUMNS} FROM ${table} WHERE id = ?`).all(id) as Row[];
      return rows[0] ? fromRow(rows[0]) : null;
    },

    async deleteBefore(before, tenantId) {
      const params: unknown[] = [before];
      let sql = `DELETE FROM ${table} WHERE occurred_at < ?`;
      if (tenantId === null) sql += " AND tenant_id IS NULL";
      else if (tenantId !== undefined) {
        params.push(tenantId);
        sql += " AND tenant_id = ?";
      }
      const result = db.prepare(sql).run(...params) as { changes?: number | bigint };
      return Number(result.changes ?? 0);
    },

    async rewriteActor(actorId: string, actor: AuditActor) {
      const rows = db
        .prepare(`SELECT ${COLUMNS} FROM ${table} WHERE actor_id = ?`)
        .all(actorId) as Row[];
      const update = db.prepare(
        `UPDATE ${table} SET actor_id = ?, actor = ?, search = ? WHERE id = ?`,
      );
      transaction(() => {
        for (const row of rows) {
          const r = toRow({ ...fromRow(row), actor });
          update.run(r.actor_id, r.actor, r.search, r.id);
        }
      });
      return rows.length;
    },
  };
}
