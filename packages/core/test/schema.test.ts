import { DatabaseSync } from "node:sqlite";
import { PGlite } from "@electric-sql/pglite";
import * as mariadb from "mariadb";
import * as mysql from "mysql2/promise";
import { afterAll, describe, expect, it } from "vitest";
import { createAuditLog, SCHEMA_VERSION, SchemaVersionError } from "../src/index";
import { migrateMysql, mysqlSchemaVersion, mysqlStore } from "../src/mysql";
import { migratePostgres, postgresSchemaVersion, postgresStore } from "../src/postgres";
import { migrateSqlite, sqliteSchemaVersion, sqliteStore } from "../src/sqlite";

describe("schema version", () => {
  it("is recorded by the SQLite migration and read back", () => {
    const db = new DatabaseSync(":memory:");
    expect(sqliteSchemaVersion({ db })).toBeNull();
    migrateSqlite({ db });
    expect(sqliteSchemaVersion({ db })).toBe(SCHEMA_VERSION);
    migrateSqlite({ db }); // idempotent
    expect(sqliteSchemaVersion({ db })).toBe(SCHEMA_VERSION);
  });

  it("refuses to migrate a SQLite database created by a newer release", () => {
    const db = new DatabaseSync(":memory:");
    migrateSqlite({ db });
    db.exec("UPDATE audit_events_meta SET value = '99' WHERE name = 'schema_version'");
    expect(() => migrateSqlite({ db })).toThrow(SchemaVersionError);
  });

  it("uses a separate version per table", () => {
    const db = new DatabaseSync(":memory:");
    migrateSqlite({ db, table: "audit_a" });
    expect(sqliteSchemaVersion({ db, table: "audit_a" })).toBe(SCHEMA_VERSION);
    expect(sqliteSchemaVersion({ db, table: "audit_b" })).toBeNull();
  });

  it("is recorded by the Postgres migration and guards against newer databases", async () => {
    const client = new PGlite();
    expect(await postgresSchemaVersion({ client })).toBeNull();
    await migratePostgres({ client });
    expect(await postgresSchemaVersion({ client })).toBe(SCHEMA_VERSION);
    await migratePostgres({ client });
    await client.exec("UPDATE audit_events_meta SET value = '99' WHERE name = 'schema_version'");
    const error = await migratePostgres({ client }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SchemaVersionError);
    expect((error as SchemaVersionError).found).toBe(99);
    await client.close();
  });

  it("works in a named Postgres schema", async () => {
    const client = new PGlite();
    await client.exec("CREATE SCHEMA audit");
    await migratePostgres({ client, schema: "audit" });
    expect(await postgresSchemaVersion({ client, schema: "audit" })).toBe(SCHEMA_VERSION);
    expect(await postgresSchemaVersion({ client })).toBeNull();
    await client.close();
  });
});

// Runs only with servers (CI sets MYSQL_URL and MARIADB_URL, see stores.test.ts).
const { MYSQL_URL, MARIADB_URL } = process.env;
const pools = [
  ["mysql2", MYSQL_URL ? mysql.createPool({ uri: MYSQL_URL, connectionLimit: 2 }) : null],
  ["mariadb", MARIADB_URL ? mariadb.createPool(MARIADB_URL) : null],
] as const;
afterAll(async () => {
  for (const [, pool] of pools) await pool?.end();
});

describe.each(pools.filter(([, pool]) => pool))("schema version (%s)", (_name, pool) => {
  it("is recorded by the migration and guards against newer databases", async () => {
    const client = pool as { query(sql: string, values?: unknown[]): Promise<unknown> };
    const table = "audit_schema_test";
    await client.query(`DROP TABLE IF EXISTS ${table}`);
    await client.query(`DROP TABLE IF EXISTS ${table}_meta`);
    expect(await mysqlSchemaVersion({ client, table })).toBeNull();
    await migrateMysql({ client, table });
    expect(await mysqlSchemaVersion({ client, table })).toBe(SCHEMA_VERSION);
    await migrateMysql({ client, table });
    await client.query(`UPDATE ${table}_meta SET value = '99' WHERE name = 'schema_version'`);
    await expect(migrateMysql({ client, table })).rejects.toBeInstanceOf(SchemaVersionError);
    await client.query(`DROP TABLE ${table}`);
    await client.query(`DROP TABLE ${table}_meta`);
  });

  it("upgrades a schema version 1 table", async () => {
    const client = pool as { query(sql: string, values?: unknown[]): Promise<unknown> };
    const table = "audit_upgrade_test";
    await client.query(`DROP TABLE IF EXISTS ${table}`);
    await client.query(`DROP TABLE IF EXISTS ${table}_meta`);
    await client.query(`CREATE TABLE ${table} (
      id VARCHAR(64) NOT NULL PRIMARY KEY, occurred_at DATETIME(3) NOT NULL, tenant_id VARCHAR(191) NULL,
      action VARCHAR(200) NOT NULL, actor_id VARCHAR(191) NOT NULL, actor JSON NOT NULL,
      targets JSON NOT NULL, changes JSON NOT NULL, context JSON NOT NULL, metadata JSON NOT NULL,
      search TEXT NOT NULL, INDEX ${table}_tenant_time (tenant_id, occurred_at, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    await client.query(
      `CREATE TABLE ${table}_meta (name VARCHAR(64) NOT NULL PRIMARY KEY, value VARCHAR(191) NOT NULL)`,
    );
    await client.query(`INSERT INTO ${table}_meta VALUES ('schema_version', '1')`);
    await client.query(
      `INSERT INTO ${table} VALUES ('01A', '2026-01-01 00:00:00.000', 'acme', 'project.created', 'u1', '{"id":"u1"}', '[]', '[]', '{}', '{}', 'project.created u1')`,
    );
    await migrateMysql({ client, table });
    expect(await mysqlSchemaVersion({ client, table })).toBe(SCHEMA_VERSION);
    const store = mysqlStore({ client, table });
    const old = await store.get("01A");
    expect(old?.action).toBe("project.created");
    expect(old?.outcome).toBeUndefined();
    await migrateMysql({ client, table }); // idempotent
    await client.query(`DROP TABLE ${table}`);
    await client.query(`DROP TABLE ${table}_meta`);
  });
});

const V1_SQLITE = `CREATE TABLE audit_events (
  id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, tenant_id TEXT, action TEXT NOT NULL,
  actor_id TEXT NOT NULL, actor TEXT NOT NULL, targets TEXT NOT NULL DEFAULT '[]',
  changes TEXT NOT NULL DEFAULT '[]', context TEXT NOT NULL DEFAULT '{}',
  metadata TEXT NOT NULL DEFAULT '{}', search TEXT NOT NULL DEFAULT ''
);
CREATE TABLE audit_events_meta (name TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO audit_events_meta VALUES ('schema_version', '1');
INSERT INTO audit_events (id, occurred_at, tenant_id, action, actor_id, actor, search)
VALUES ('01A', '2026-01-01T00:00:00.000Z', 'acme', 'project.created', 'u1', '{"id":"u1","type":"user"}', 'project.created u1');`;

describe("upgrade from schema version 1", () => {
  it("adds the columns to a SQLite table and keeps the old events readable", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(V1_SQLITE);
    expect(sqliteSchemaVersion({ db })).toBe(1);
    migrateSqlite({ db });
    expect(sqliteSchemaVersion({ db })).toBe(SCHEMA_VERSION);
    const store = sqliteStore({ db });
    const old = await store.get("01A");
    expect(old?.action).toBe("project.created");
    expect(old?.outcome).toBeUndefined();
    const audit = createAuditLog({ store });
    expect((await audit.query({ outcome: "success" })).events).toHaveLength(1);
    await audit.record({ action: "x.y", actor: { id: "u" }, outcome: "failure" });
    expect((await audit.query({ outcome: "failure" })).events).toHaveLength(1);
    migrateSqlite({ db }); // idempotent
  });

  it("adds the columns to a Postgres table that predates version tracking", async () => {
    const client = new PGlite();
    await client.exec(`CREATE TABLE audit_events (
      id text COLLATE "C" PRIMARY KEY, occurred_at timestamptz NOT NULL, tenant_id text,
      action text NOT NULL, actor_id text NOT NULL, actor jsonb NOT NULL,
      targets jsonb NOT NULL DEFAULT '[]', changes jsonb NOT NULL DEFAULT '[]',
      context jsonb NOT NULL DEFAULT '{}', metadata jsonb NOT NULL DEFAULT '{}',
      search text NOT NULL DEFAULT '');
      INSERT INTO audit_events (id, occurred_at, action, actor_id, actor)
      VALUES ('01A', '2026-01-01T00:00:00Z', 'project.created', 'u1', '{"id":"u1"}');`);
    expect(await postgresSchemaVersion({ client })).toBeNull();
    await migratePostgres({ client });
    expect(await postgresSchemaVersion({ client })).toBe(SCHEMA_VERSION);
    const store = postgresStore({ client });
    expect((await store.get("01A"))?.action).toBe("project.created");
    const audit = createAuditLog({ store });
    expect((await audit.query({ outcome: "success" })).events).toHaveLength(1);
    await client.close();
  });
});
