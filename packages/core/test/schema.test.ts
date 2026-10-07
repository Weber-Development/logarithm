import { DatabaseSync } from "node:sqlite";
import { PGlite } from "@electric-sql/pglite";
import * as mariadb from "mariadb";
import * as mysql from "mysql2/promise";
import { afterAll, describe, expect, it } from "vitest";
import { SCHEMA_VERSION, SchemaVersionError } from "../src/index";
import { migrateMysql, mysqlSchemaVersion } from "../src/mysql";
import { migratePostgres, postgresSchemaVersion } from "../src/postgres";
import { migrateSqlite, sqliteSchemaVersion } from "../src/sqlite";

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
});
