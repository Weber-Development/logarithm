import { assertSchemaVersion, parseSchemaVersion, SCHEMA_VERSION } from "./schema";
import {
  buildWhere,
  countSelect,
  fromRow,
  type Row,
  toGroups,
  toRow,
  type WhereDialect,
} from "./sql";
import type { AuditActor, AuditStore, StoreQuery } from "./types";

/**
 * Anything with a `query(sql, values)` method: a `mysql2/promise` pool or connection (resolves to
 * `[rows, fields]`), a `mariadb` pool or connection (resolves to the rows), or a wrapper around
 * your own driver that resolves to `{ rows }` or `{ affectedRows }`.
 */
export interface MysqlClient {
  query(sql: string, values?: unknown[]): Promise<unknown>;
}

export interface MysqlStoreOptions {
  client: MysqlClient;
  /** Default `audit_events`. */
  table?: string;
  /** Database (schema) name, e.g. `audit`. Default: the connection's database. */
  database?: string;
}

/** Table and database names are interpolated into SQL, so only plain identifiers are accepted. */
function identifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) {
    throw new Error(`Invalid SQL identifier "${name}"`);
  }
  return `\`${name}\``;
}

function qualified(options: { table?: string; database?: string }): {
  table: string;
  name: string;
} {
  const name = options.table ?? "audit_events";
  const table = options.database
    ? `${identifier(options.database)}.${identifier(name)}`
    : identifier(name);
  return { table, name };
}

function metaTable(options: { table?: string; database?: string }): string {
  const { name } = qualified(options);
  return options.database
    ? `${identifier(options.database)}.${identifier(`${name}_meta`)}`
    : identifier(`${name}_meta`);
}

/** The `CREATE TABLE` statements, to run yourself (one after the other) or to copy into your migration tool. */
export function mysqlSchema(options: { table?: string; database?: string } = {}): string {
  const { table, name } = qualified(options);
  const meta = metaTable(options);
  const index = (suffix: string) => identifier(`${name}_${suffix}`);
  // utf8mb4_bin makes ids, actions and tenants compare exactly, like in Postgres and SQLite.
  return `CREATE TABLE IF NOT EXISTS ${table} (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  occurred_at DATETIME(3) NOT NULL,
  tenant_id VARCHAR(191) NULL,
  action VARCHAR(200) NOT NULL,
  actor_id VARCHAR(191) NOT NULL,
  actor JSON NOT NULL,
  targets JSON NOT NULL,
  changes JSON NOT NULL,
  context JSON NOT NULL,
  metadata JSON NOT NULL,
  search TEXT NOT NULL,
  INDEX ${index("tenant_time")} (tenant_id, occurred_at, id),
  INDEX ${index("actor_time")} (actor_id, occurred_at),
  INDEX ${index("action")} (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS ${meta} (
  name VARCHAR(64) NOT NULL PRIMARY KEY,
  value VARCHAR(191) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
INSERT IGNORE INTO ${meta} (name, value) VALUES ('schema_version', '${SCHEMA_VERSION}');`;
}

/**
 * The schema version stored in the database, or `null` when Logarithm has not created its tables
 * there yet (or they predate version tracking).
 */
export async function mysqlSchemaVersion(options: MysqlStoreOptions): Promise<number | null> {
  const name = `${options.table ?? "audit_events"}_meta`;
  const meta = metaTable(options);
  const found = rowsOf(
    await options.client.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = COALESCE(?, DATABASE()) AND table_name = ?",
      [options.database ?? null, name],
    ),
  ) as { n: unknown }[];
  if (Number(found[0]?.n) === 0) return null;
  const rows = rowsOf(
    await options.client.query(`SELECT value FROM ${meta} WHERE name = 'schema_version'`, []),
  ) as { value: unknown }[];
  return parseSchemaVersion(rows[0]?.value);
}

/**
 * Creates the table and indexes if they do not exist yet and records the schema version. Throws a
 * `SchemaVersionError` when the database was created by a newer version of Logarithm.
 */
export async function migrateMysql(options: MysqlStoreOptions): Promise<void> {
  assertSchemaVersion(await mysqlSchemaVersion(options));
  for (const statement of mysqlSchema(options).split(";\n")) {
    await options.client.query(statement.replace(/;$/, ""));
  }
}

/** Normalises what the different drivers resolve to. */
function rowsOf(result: unknown): unknown[] {
  // mysql2: [rows, fields]; fields is an array for SELECT and undefined for other statements.
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    (Array.isArray(result[0]) || isHeader(result[0])) &&
    (result[1] === undefined || Array.isArray(result[1]))
  ) {
    return Array.isArray(result[0]) ? result[0] : [];
  }
  if (Array.isArray(result)) return result; // mariadb
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: unknown[] }).rows;
  }
  return [];
}

function isHeader(value: unknown): value is { affectedRows: number | bigint } {
  return !!value && typeof value === "object" && "affectedRows" in value;
}

function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return isHeader(header) ? Number(header.affectedRows) : 0;
}

/** `2026-10-05T10:31:00.000Z` → `2026-10-05 10:31:00.000`, the DATETIME literal in UTC. */
function toDatetime(iso: string): string {
  return iso.replace("T", " ").replace("Z", "");
}

function toDatetimes<Q extends Omit<StoreQuery, "limit">>(q: Q): Q {
  const out = { ...q };
  if (out.from) out.from = toDatetime(out.from);
  if (out.to) out.to = toDatetime(out.to);
  if (out.before) out.before = { ...out.before, occurredAt: toDatetime(out.before.occurredAt) };
  return out;
}

// DATETIME has no time zone; read it back as text so no driver converts it to local time.
const SELECT_COLUMNS =
  "id, DATE_FORMAT(occurred_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS occurred_at, tenant_id, action, actor_id, actor, targets, changes, context, metadata";

const DIALECT: WhereDialect = {
  param: () => "?",
  time: (p) => p,
  targetHas: (field, p) => `JSON_CONTAINS(targets, JSON_OBJECT('${field}', ${p}))`,
  // A backslash would have to be written differently depending on NO_BACKSLASH_ESCAPES.
  likeEscape: "!",
};

const GROUP_KEYS = {
  day: "DATE_FORMAT(occurred_at, '%Y-%m-%d')",
  action: "action",
  actor: "actor_id",
};

/**
 * Stores events in MySQL (8.0 or newer) or MariaDB (10.6 or newer). Timestamps are stored as
 * `DATETIME(3)` in UTC. Run {@link migrateMysql} once before use.
 */
export function mysqlStore(options: MysqlStoreOptions): AuditStore {
  const { client } = options;
  const { table } = qualified(options);
  const select = async (sql: string, values: unknown[]) =>
    rowsOf(await client.query(sql, values)) as Row[];

  return {
    async insert(events) {
      if (events.length === 0) return;
      const values: unknown[] = [];
      const tuples = events.map((event) => {
        const r = toRow(event);
        values.push(
          r.id,
          toDatetime(r.occurred_at),
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
        return "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
      });
      await client.query(
        `INSERT INTO ${table} (id, occurred_at, tenant_id, action, actor_id, actor, targets, changes, context, metadata, search) VALUES ${tuples.join(", ")}`,
        values,
      );
    },

    async query(q) {
      const where = buildWhere(toDatetimes(q), DIALECT);
      // Inlined: prepared statements (mysql2 `execute`) reject a placeholder for LIMIT.
      const limit = Math.max(0, Math.floor(Number(q.limit)));
      const rows = await select(
        `SELECT ${SELECT_COLUMNS} FROM ${table} ${where.sql} ORDER BY occurred_at DESC, id DESC LIMIT ${limit}`,
        where.params,
      );
      return rows.map(fromRow);
    },

    async count(filter, groupBy) {
      const where = buildWhere(toDatetimes(filter), DIALECT);
      const { select: columns, group } = countSelect(groupBy, GROUP_KEYS);
      const rows = await select(
        `SELECT ${columns} FROM ${table} ${where.sql}${group}`,
        where.params,
      );
      return toGroups(rows as unknown as { group_key?: unknown; n: unknown }[], groupBy);
    },

    async get(id) {
      const rows = await select(`SELECT ${SELECT_COLUMNS} FROM ${table} WHERE id = ?`, [id]);
      return rows[0] ? fromRow(rows[0]) : null;
    },

    async deleteBefore(before, tenantId) {
      const params: unknown[] = [toDatetime(before)];
      let sql = `DELETE FROM ${table} WHERE occurred_at < ?`;
      if (tenantId === null) sql += " AND tenant_id IS NULL";
      else if (tenantId !== undefined) {
        params.push(tenantId);
        sql += " AND tenant_id = ?";
      }
      return affectedRows(await client.query(sql, params));
    },

    async rewriteActor(actorId: string, actor: AuditActor) {
      // Row by row, because the search column has to be rebuilt from the new actor.
      const rows = await select(`SELECT ${SELECT_COLUMNS} FROM ${table} WHERE actor_id = ?`, [
        actorId,
      ]);
      for (const row of rows) {
        const r = toRow({ ...fromRow(row), actor });
        await client.query(`UPDATE ${table} SET actor_id = ?, actor = ?, search = ? WHERE id = ?`, [
          r.actor_id,
          r.actor,
          r.search,
          r.id,
        ]);
      }
      return rows.length;
    },
  };
}
