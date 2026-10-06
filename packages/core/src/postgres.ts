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

/**
 * Anything with a `pg`-style `query(text, values)` method: `pg.Pool`, `pg.Client`,
 * `@neondatabase/serverless` Pool, PGlite, or a wrapper around your own driver.
 */
export interface PostgresClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

export interface PostgresStoreOptions {
  client: PostgresClient;
  /** Default `audit_events`. */
  table?: string;
  /** Postgres schema, e.g. `audit`. Default: the connection's search path. */
  schema?: string;
}

function qualified(options: { table?: string; schema?: string }): { table: string; name: string } {
  const name = options.table ?? "audit_events";
  const table = options.schema
    ? `${identifier(options.schema)}.${identifier(name)}`
    : identifier(name);
  return { table, name };
}

/** The `CREATE TABLE` statements, to run yourself or to copy into your migration tool. */
export function postgresSchema(options: { table?: string; schema?: string } = {}): string {
  const { table, name } = qualified(options);
  const index = (suffix: string) => identifier(`${name}_${suffix}`);
  return `CREATE TABLE IF NOT EXISTS ${table} (
  id text COLLATE "C" PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  tenant_id text,
  action text NOT NULL,
  actor_id text NOT NULL,
  actor jsonb NOT NULL,
  targets jsonb NOT NULL DEFAULT '[]',
  changes jsonb NOT NULL DEFAULT '[]',
  context jsonb NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}',
  search text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS ${index("tenant_time")} ON ${table} (tenant_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ${index("actor_time")} ON ${table} (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ${index("action")} ON ${table} (action text_pattern_ops);
CREATE INDEX IF NOT EXISTS ${index("targets")} ON ${table} USING gin (targets jsonb_path_ops);`;
}

/** Creates the table and indexes if they do not exist yet. */
export async function migratePostgres(options: PostgresStoreOptions): Promise<void> {
  for (const statement of postgresSchema(options).split(";\n")) {
    await options.client.query(statement);
  }
}

const COLUMNS =
  "id, occurred_at, tenant_id, action, actor_id, actor, targets, changes, context, metadata";

const DIALECT: WhereDialect = {
  param: (n) => `$${n}`,
  time: (p) => `${p}::timestamptz`,
  targetHas: (field, p) =>
    `targets @> jsonb_build_array(jsonb_build_object('${field}', ${p}::text))`,
};

const GROUP_KEYS = {
  day: "to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')",
  action: "action",
  actor: "actor_id",
};

/** Stores events in Postgres (13 or newer). Run {@link migratePostgres} once before use. */
export function postgresStore(options: PostgresStoreOptions): AuditStore {
  const { client } = options;
  const { table } = qualified(options);

  return {
    async insert(events) {
      if (events.length === 0) return;
      const values: unknown[] = [];
      const tuples = events.map((event) => {
        const r = toRow(event);
        const row = [
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
        ];
        const start = values.length;
        values.push(...row);
        const ph = row.map((_, i) => `$${start + i + 1}`);
        return `(${ph[0]}, ${ph[1]}::timestamptz, ${ph[2]}, ${ph[3]}, ${ph[4]}, ${ph[5]}::jsonb, ${ph[6]}::jsonb, ${ph[7]}::jsonb, ${ph[8]}::jsonb, ${ph[9]}::jsonb, ${ph[10]})`;
      });
      await client.query(
        `INSERT INTO ${table} (${COLUMNS}, search) VALUES ${tuples.join(", ")}`,
        values,
      );
    },

    async query(q) {
      const where = buildWhere(q, DIALECT);
      const limit = `$${where.params.length + 1}`;
      const result = await client.query(
        `SELECT ${COLUMNS} FROM ${table} ${where.sql} ORDER BY occurred_at DESC, id DESC LIMIT ${limit}`,
        [...where.params, q.limit],
      );
      return (result.rows as Row[]).map(fromRow);
    },

    async count(filter, groupBy) {
      const where = buildWhere(filter, DIALECT);
      const { select, group } = countSelect(groupBy, GROUP_KEYS);
      const result = await client.query(
        `SELECT ${select} FROM ${table} ${where.sql}${group}`,
        where.params,
      );
      return toGroups(result.rows as { group_key?: unknown; n: unknown }[], groupBy);
    },

    async get(id) {
      const result = await client.query(`SELECT ${COLUMNS} FROM ${table} WHERE id = $1`, [id]);
      const row = result.rows[0] as Row | undefined;
      return row ? fromRow(row) : null;
    },

    async deleteBefore(before, tenantId) {
      const params: unknown[] = [before];
      let sql = `DELETE FROM ${table} WHERE occurred_at < $1::timestamptz`;
      if (tenantId === null) sql += " AND tenant_id IS NULL";
      else if (tenantId !== undefined) {
        params.push(tenantId);
        sql += " AND tenant_id = $2";
      }
      const result = await client.query(sql, params);
      return result.rowCount ?? 0;
    },

    async rewriteActor(actorId: string, actor: AuditActor) {
      // Row by row, because the search column has to be rebuilt from the new actor.
      const result = await client.query(`SELECT ${COLUMNS} FROM ${table} WHERE actor_id = $1`, [
        actorId,
      ]);
      for (const row of result.rows as Row[]) {
        const r = toRow({ ...fromRow(row), actor });
        await client.query(
          `UPDATE ${table} SET actor_id = $2, actor = $3::jsonb, search = $4 WHERE id = $1`,
          [r.id, r.actor_id, r.actor, r.search],
        );
      }
      return result.rows.length;
    },
  };
}
