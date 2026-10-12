import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { createAuditLog } from "../src/index";
import {
  detachPartitions,
  ensurePartitions,
  listPartitions,
  migratePostgres,
  postgresSchema,
  postgresStore,
} from "../src/postgres";
import { runStoreConformance } from "../src/testing";

async function create(extra = {}) {
  const client = new PGlite();
  await migratePostgres({ client, partitioned: true, ...extra });
  return client;
}

describe("partitioned Postgres table", () => {
  it("passes the store conformance suite", async () => {
    const failures = await runStoreConformance(async () =>
      postgresStore({ client: await create() }),
    );
    expect(failures).toEqual([]);
  });

  it("creates month partitions idempotently and reports what it created", async () => {
    const client = await create();
    const created = await ensurePartitions({
      client,
      from: "2026-10-12T00:00:00Z",
      to: "2027-01-03T00:00:00Z",
    });
    expect(created).toEqual([
      "audit_events_p2026_10",
      "audit_events_p2026_11",
      "audit_events_p2026_12",
      "audit_events_p2027_01",
    ]);
    expect(
      await ensurePartitions({ client, from: "2026-10-01T00:00:00Z", to: "2026-11-30T00:00:00Z" }),
    ).toEqual([]);
    const list = await listPartitions({ client });
    expect(list.map((p) => p.from)).toEqual([
      "2026-10-01T00:00:00.000Z",
      "2026-11-01T00:00:00.000Z",
      "2026-12-01T00:00:00.000Z",
      "2027-01-01T00:00:00.000Z",
    ]);
    expect(list[0]?.to).toBe("2026-11-01T00:00:00.000Z");
    await client.close();
  });

  it("routes events to their month and keeps events outside every range in the default partition", async () => {
    const client = await create();
    await ensurePartitions({ client, from: "2026-10-01T00:00:00Z", to: "2026-11-01T00:00:00Z" });
    const audit = createAuditLog({ store: postgresStore({ client }) });
    for (const at of ["2026-10-15T12:00:00Z", "2026-11-02T00:00:00Z", "2025-01-01T00:00:00Z"]) {
      await audit.record({ action: "a.b", actor: { id: "u" }, occurredAt: at });
    }
    const count = async (relation: string) =>
      (await client.query(`SELECT count(*)::int AS n FROM ${relation}`)).rows[0] as { n: number };
    expect(await count("audit_events_p2026_10")).toEqual({ n: 1 });
    expect(await count("audit_events_p2026_11")).toEqual({ n: 1 });
    expect(await count("audit_events_default")).toEqual({ n: 1 });
    expect((await audit.query()).events).toHaveLength(3);
    const [one] = (await audit.query({ limit: 1 })).events;
    expect(await audit.get(one?.id as string)).toEqual(one);
    await client.close();
  });

  it("detaches old partitions so their data can be archived, and drops them on request", async () => {
    const client = await create();
    await ensurePartitions({ client, from: "2026-08-01T00:00:00Z", to: "2026-10-01T00:00:00Z" });
    const audit = createAuditLog({ store: postgresStore({ client }) });
    await audit.record({ action: "a.b", actor: { id: "u" }, occurredAt: "2026-08-10T00:00:00Z" });
    await audit.record({ action: "a.b", actor: { id: "u" }, occurredAt: "2026-10-10T00:00:00Z" });
    const detached = await detachPartitions({ client, olderThan: "2026-10-01T00:00:00Z" });
    expect(detached.map((p) => p.name)).toEqual(["audit_events_p2026_08", "audit_events_p2026_09"]);
    expect((await audit.query()).events).toHaveLength(1);
    // The detached table still holds the August event.
    expect(
      (await client.query("SELECT count(*)::int AS n FROM audit_events_p2026_08")).rows[0],
    ).toEqual({ n: 1 });
    await detachPartitions({ client, olderThan: "2027-01-01T00:00:00Z", drop: true });
    await expect(client.query("SELECT 1 FROM audit_events_p2026_10")).rejects.toThrow();
    await client.close();
  });

  it("supports yearly partitions in a named schema", async () => {
    const client = new PGlite();
    await client.exec("CREATE SCHEMA audit");
    await migratePostgres({ client, schema: "audit", partitioned: true });
    const created = await ensurePartitions({
      client,
      schema: "audit",
      interval: "year",
      from: "2026-03-01T00:00:00Z",
      to: "2027-06-01T00:00:00Z",
    });
    expect(created).toEqual(["audit_events_p2026", "audit_events_p2027"]);
    await client.close();
  });

  it("changes nothing for tables that are not partitioned", () => {
    expect(postgresSchema()).not.toContain("PARTITION");
    expect(postgresSchema({ partitioned: true })).toContain("PARTITION BY RANGE (occurred_at)");
  });
});
