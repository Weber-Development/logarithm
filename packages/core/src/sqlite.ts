import { assertSchemaVersion, parseSchemaVersion, SCHEMA_VERSION } from "./schema";
import {
  buildWhere,
  countSelect,
  fromRow,
  identifier,
  type Row,
  toGroups,
  toRow,
  type WhereDialect,
} from "./sql";
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
  outcome TEXT,
  correlation_id TEXT,
  search TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ${index("tenant_time")} ON ${table} (tenant_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ${index("actor_time")} ON ${table} (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ${index("action")} ON ${table} (action);
CREATE INDEX IF NOT EXISTS ${index("correlation")} ON ${table} (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS ${identifier(`${name}_meta`)} (name TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO ${identifier(`${name}_meta`)} (name, value) VALUES ('schema_version', '${SCHEMA_VERSION}');`;
}

/**
 * The statements that bring a table of schema version 1 (Logarithm 0.6 to 1.x) to version 2. Run
 * them yourself if you keep migrations in your own tool; `migrateSqlite` does it for you. SQLite
 * has no `ADD COLUMN IF NOT EXISTS`, so run each `ALTER` only once.
 */
export function sqliteUpgradeSchema(options: { table?: string } = {}): string {
  const name = options.table ?? "audit_events";
  const table = identifier(name);
  return `ALTER TABLE ${table} ADD COLUMN outcome TEXT;
ALTER TABLE ${table} ADD COLUMN correlation_id TEXT;`;
}

/**
 * The schema version stored in the database, or `null` when Logarithm has not created its tables
 * there yet (or they predate version tracking).
 */
export function sqliteSchemaVersion(options: SqliteStoreOptions): number | null {
  const meta = options.table ?? "audit_events";
  const exists = options.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all(`${meta}_meta`);
  if (exists.length === 0) return null;
  const rows = options.db
    .prepare(`SELECT value FROM ${identifier(`${meta}_meta`)} WHERE name = 'schema_version'`)
    .all() as { value: unknown }[];
  return parseSchemaVersion(rows[0]?.value);
}

/**
 * Creates the table and indexes if they do not exist yet and records the schema version. Throws a
 * `SchemaVersionError` when the database was created by a newer version of Logarithm.
 */
export function migrateSqlite(options: SqliteStoreOptions): void {
  assertSchemaVersion(sqliteSchemaVersion(options));
  const name = options.table ?? "audit_events";
  const existing = options.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .all(name);
  if (existing.length > 0) {
    const columns = options.db.prepare(`PRAGMA table_info(${identifier(name)})`).all() as {
      name: string;
    }[];
    for (const column of ["outcome", "correlation_id"]) {
      if (!columns.some((c) => c.name === column)) {
        options.db.exec(`ALTER TABLE ${identifier(name)} ADD COLUMN ${column} TEXT`);
      }
    }
  }
  options.db.exec(sqliteSchema(options));
  options.db
    .prepare(`UPDATE ${identifier(`${name}_meta`)} SET value = ? WHERE name = 'schema_version'`)
    .run(String(SCHEMA_VERSION));
}

const COLUMNS =
  "id, occurred_at, tenant_id, action, actor_id, actor, targets, changes, context, metadata, outcome, correlation_id";

const DIALECT: WhereDialect = {
  param: () => "?",
  time: (p) => p,
  targetHas: (field, p) =>
    `EXISTS (SELECT 1 FROM json_each(targets) WHERE json_extract(value, '$.${field}') = ${p})`,
};

// Timestamps are stored as ISO text in UTC, so the first ten characters are the day.
const GROUP_KEYS = { day: "substr(occurred_at, 1, 10)", action: "action", actor: "actor_id" };

/**
 * Stores events in SQLite. Timestamps are stored as ISO 8601 text in UTC, which sorts correctly.
 * Run {@link migrateSqlite} once before use.
 */
export function sqliteStore(options: SqliteStoreOptions): AuditStore {
  const { db } = options;
  const table = identifier(options.table ?? "audit_events");
  const insert = db.prepare(
    `INSERT INTO ${table} (${COLUMNS}, search) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            r.outcome,
            r.correlation_id,
            r.search,
          );
        }
      });
    },

    async query(q) {
      const where = buildWhere(q, DIALECT);
      const rows = db
        .prepare(
          `SELECT ${COLUMNS} FROM ${table} ${where.sql} ORDER BY occurred_at DESC, id DESC LIMIT ?`,
        )
        .all(...where.params, q.limit) as Row[];
      return rows.map(fromRow);
    },

    async count(filter, groupBy) {
      const where = buildWhere(filter, DIALECT);
      const { select, group } = countSelect(groupBy, GROUP_KEYS);
      const rows = db
        .prepare(`SELECT ${select} FROM ${table} ${where.sql}${group}`)
        .all(...where.params) as { group_key?: unknown; n: unknown }[];
      return toGroups(rows, groupBy);
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
