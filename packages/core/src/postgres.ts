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

/**
 * Anything with a `pg`-style `query(text, values)` method: `pg.Pool`, `pg.Client`,
 * `@neondatabase/serverless` Pool, PGlite, or a wrapper around your own driver.
 */
export interface PostgresClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

export interface PostgresStoreOptions extends PostgresSchemaOptions {
  client: PostgresClient;
}

/** Options shared by the functions that create or change the table layout. */
export interface PostgresSchemaOptions {
  /** Default `audit_events`. */
  table?: string;
  /** Postgres schema, e.g. `audit`. Default: the connection's search path. */
  schema?: string;
  /**
   * Create the table partitioned by `occurred_at` (declarative range partitioning), with a default
   * partition that catches events outside the ranges you created. See {@link ensurePartitions}.
   */
  partitioned?: boolean;
}

function qualified(options: { table?: string; schema?: string }): { table: string; name: string } {
  const name = options.table ?? "audit_events";
  const table = options.schema
    ? `${identifier(options.schema)}.${identifier(name)}`
    : identifier(name);
  return { table, name };
}

function metaTable(options: { table?: string; schema?: string }): string {
  const { name } = qualified(options);
  return options.schema
    ? `${identifier(options.schema)}.${identifier(`${name}_meta`)}`
    : identifier(`${name}_meta`);
}

/** The `CREATE TABLE` statements, to run yourself or to copy into your migration tool. */
export function postgresSchema(options: PostgresSchemaOptions = {}): string {
  const { table, name } = qualified(options);
  const meta = metaTable(options);
  const index = (suffix: string) => identifier(`${name}_${suffix}`);
  const partitioned = options.partitioned === true;
  const qualify = (child: string) =>
    options.schema ? `${identifier(options.schema)}.${identifier(child)}` : identifier(child);
  return `CREATE TABLE IF NOT EXISTS ${table} (
  id text COLLATE "C" ${partitioned ? "NOT NULL" : "PRIMARY KEY"},
  occurred_at timestamptz NOT NULL,
  tenant_id text,
  action text NOT NULL,
  actor_id text NOT NULL,
  actor jsonb NOT NULL,
  targets jsonb NOT NULL DEFAULT '[]',
  changes jsonb NOT NULL DEFAULT '[]',
  context jsonb NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}',
  outcome text,
  correlation_id text,
  search text NOT NULL DEFAULT ''${partitioned ? ",\n  PRIMARY KEY (occurred_at, id)" : ""}
)${partitioned ? " PARTITION BY RANGE (occurred_at)" : ""};${
    partitioned
      ? `\nCREATE TABLE IF NOT EXISTS ${qualify(`${name}_default`)} PARTITION OF ${table} DEFAULT;\nCREATE INDEX IF NOT EXISTS ${index("id")} ON ${table} (id);`
      : ""
  }
CREATE INDEX IF NOT EXISTS ${index("tenant_time")} ON ${table} (tenant_id, occurred_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ${index("actor_time")} ON ${table} (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ${index("action")} ON ${table} (action text_pattern_ops);
CREATE INDEX IF NOT EXISTS ${index("targets")} ON ${table} USING gin (targets jsonb_path_ops);
CREATE INDEX IF NOT EXISTS ${index("correlation")} ON ${table} (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS ${meta} (name text PRIMARY KEY, value text NOT NULL);
INSERT INTO ${meta} (name, value) VALUES ('schema_version', '${SCHEMA_VERSION}') ON CONFLICT (name) DO NOTHING;`;
}

/**
 * The statements that bring a table of schema version 1 (Logarithm 0.6 to 1.x) to version 2. All
 * are idempotent. Run them yourself if you keep migrations in your own tool; `migratePostgres`
 * does it for you.
 */
export function postgresUpgradeSchema(options: PostgresSchemaOptions = {}): string {
  const { table } = qualified(options);
  return `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS correlation_id text;`;
}

/**
 * The schema version stored in the database, or `null` when Logarithm has not created its tables
 * there yet (or they predate version tracking).
 */
export async function postgresSchemaVersion(options: PostgresStoreOptions): Promise<number | null> {
  const meta = metaTable(options);
  const found = await options.client.query("SELECT to_regclass($1) AS found", [meta]);
  if (!(found.rows[0] as { found: unknown } | undefined)?.found) return null;
  const { rows } = await options.client.query(
    `SELECT value FROM ${meta} WHERE name = 'schema_version'`,
  );
  return parseSchemaVersion((rows[0] as { value: unknown } | undefined)?.value);
}

/**
 * Creates the table and indexes if they do not exist yet and records the schema version. Throws a
 * `SchemaVersionError` when the database was created by a newer version of Logarithm.
 */
export async function migratePostgres(options: PostgresStoreOptions): Promise<void> {
  assertSchemaVersion(await postgresSchemaVersion(options));
  const { table } = qualified(options);
  const exists = await options.client.query("SELECT to_regclass($1) AS found", [table]);
  if ((exists.rows[0] as { found: unknown } | undefined)?.found) {
    for (const statement of postgresUpgradeSchema(options).split(";\n")) {
      await options.client.query(statement);
    }
  }
  for (const statement of postgresSchema(options).split(";\n")) {
    await options.client.query(statement);
  }
  await options.client.query(
    `UPDATE ${metaTable(options)} SET value = $1 WHERE name = 'schema_version'`,
    [String(SCHEMA_VERSION)],
  );
}

const COLUMNS =
  "id, occurred_at, tenant_id, action, actor_id, actor, targets, changes, context, metadata, outcome, correlation_id";

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
          r.outcome,
          r.correlation_id,
          r.search,
        ];
        const start = values.length;
        values.push(...row);
        const ph = row.map((_, i) => `$${start + i + 1}`);
        return `(${ph[0]}, ${ph[1]}::timestamptz, ${ph[2]}, ${ph[3]}, ${ph[4]}, ${ph[5]}::jsonb, ${ph[6]}::jsonb, ${ph[7]}::jsonb, ${ph[8]}::jsonb, ${ph[9]}::jsonb, ${ph[10]}, ${ph[11]}, ${ph[12]})`;
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

// --- Partitioning ---------------------------------------------------------------------------

/** How long one partition of a partitioned table covers. */
export type PartitionInterval = "month" | "year";

export interface PartitionOptions extends PostgresStoreOptions {
  /** Default `month`. Use the same value every time you manage one table. */
  interval?: PartitionInterval;
}

export interface PartitionInfo {
  /** Table name of the partition, without schema. */
  name: string;
  /** Inclusive lower bound, ISO 8601 UTC. */
  from: string;
  /** Exclusive upper bound, ISO 8601 UTC. */
  to: string;
}

function startOf(date: Date, interval: PartitionInterval): Date {
  return interval === "year"
    ? new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextStart(date: Date, interval: PartitionInterval): Date {
  return interval === "year"
    ? new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 1))
    : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function partitionName(base: string, start: Date, interval: PartitionInterval): string {
  const year = String(start.getUTCFullYear());
  return interval === "year"
    ? `${base}_p${year}`
    : `${base}_p${year}_${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toDate(value: Date | string, name: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${name}: ${String(value)}`);
  return date;
}

/**
 * Creates the partitions that cover `from` to `to` (both included) if they do not exist yet, and
 * returns the names of the ones it created. Safe to run again, so call it from a daily or monthly
 * job a few months ahead.
 *
 * Needs a table created with `partitioned: true`. Events outside every partition land in the
 * default partition, so no event is lost if the job is late. Postgres refuses to create a
 * partition for a range in which the default partition already holds events; move those rows
 * out first (`INSERT INTO <new> SELECT ... ; DELETE FROM <default> ...`) or create the partition
 * before the events arrive.
 */
export async function ensurePartitions(
  options: PartitionOptions & { from: Date | string; to: Date | string },
): Promise<string[]> {
  const interval = options.interval ?? "month";
  const { table, name } = qualified(options);
  const from = toDate(options.from, "from");
  const to = toDate(options.to, "to");
  if (to < from) throw new Error("to must not be before from");
  const existing = new Set((await listPartitions(options)).map((p) => p.name));
  const created: string[] = [];
  for (let start = startOf(from, interval); start <= to; start = nextStart(start, interval)) {
    const child = partitionName(name, start, interval);
    if (existing.has(child)) continue;
    const childTable = options.schema
      ? `${identifier(options.schema)}.${identifier(child)}`
      : identifier(child);
    const end = nextStart(start, interval);
    await options.client.query(
      `CREATE TABLE IF NOT EXISTS ${childTable} PARTITION OF ${table} FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')`,
    );
    created.push(child);
  }
  return created;
}

/** Normalises what Postgres prints for a bound (`2026-10-01 02:00:00+02`) to ISO 8601 UTC. */
function boundToIso(text: string): string {
  const iso = text.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  return new Date(iso).toISOString();
}

/** Lists the range partitions of the table (not the default partition), oldest first. */
export async function listPartitions(options: PostgresStoreOptions): Promise<PartitionInfo[]> {
  const { table } = qualified(options);
  const { rows } = await options.client.query(
    `SELECT c.relname AS name, pg_get_expr(c.relpartbound, c.oid) AS bound
       FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
      WHERE i.inhparent = to_regclass($1) ORDER BY c.relname`,
    [table],
  );
  const out: PartitionInfo[] = [];
  for (const row of rows as { name: string; bound: string }[]) {
    const match = /FROM \('([^']+)'\) TO \('([^']+)'\)/.exec(row.bound);
    if (match?.[1] && match[2]) {
      out.push({ name: row.name, from: boundToIso(match[1]), to: boundToIso(match[2]) });
    }
  }
  return out.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/**
 * Detaches the partitions whose range ends on or before `olderThan`, which removes a whole month
 * of events in an instant instead of a long `DELETE`. Returns what it detached. The detached
 * tables keep their data and become ordinary tables: export them (for example with `COPY` to a
 * file or S3) and drop them, or pass `drop: true` to drop them straight away. Leave `drop` off
 * until your archive is written.
 */
export async function detachPartitions(
  options: PartitionOptions & { olderThan: Date | string; drop?: boolean },
): Promise<PartitionInfo[]> {
  const { table } = qualified(options);
  const cutoff = toDate(options.olderThan, "olderThan").toISOString();
  const detached: PartitionInfo[] = [];
  for (const partition of await listPartitions(options)) {
    if (partition.to > cutoff) continue;
    const child = options.schema
      ? `${identifier(options.schema)}.${identifier(partition.name)}`
      : identifier(partition.name);
    await options.client.query(`ALTER TABLE ${table} DETACH PARTITION ${child}`);
    if (options.drop) await options.client.query(`DROP TABLE ${child}`);
    detached.push(partition);
  }
  return detached;
}
