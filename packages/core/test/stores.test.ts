import { DatabaseSync } from "node:sqlite";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { type AuditLog, type AuditStore, createAuditLog, memoryStore } from "../src/index";
import { migratePostgres, postgresStore } from "../src/postgres";
import { migrateSqlite, sqliteStore } from "../src/sqlite";

const pg = new PGlite();
afterAll(() => pg.close());

const factories: Record<string, () => Promise<AuditStore>> = {
  memory: async () => memoryStore(),
  sqlite: async () => {
    const db = new DatabaseSync(":memory:");
    migrateSqlite({ db });
    return sqliteStore({ db });
  },
  postgres: async () => {
    await pg.exec("DROP TABLE IF EXISTS audit_events");
    await migratePostgres({ client: pg });
    return postgresStore({ client: pg });
  },
};

const anna = { id: "u_anna", name: "Anna Muster", email: "anna@example.ch" };
const ben = { id: "u_ben", name: "Ben Keller" };

describe.each(Object.keys(factories))("%s store", (kind) => {
  let audit: AuditLog;
  let store: AuditStore;
  let clock = Date.parse("2026-10-01T08:00:00.000Z");

  beforeEach(async () => {
    store = await (factories[kind] as () => Promise<AuditStore>)();
    clock = Date.parse("2026-10-01T08:00:00.000Z");
    audit = createAuditLog({
      store,
      now: () => {
        clock += 60_000;
        return new Date(clock);
      },
    });
    const acme = audit.with({ tenantId: "acme" });
    await acme.record({
      action: "project.created",
      actor: anna,
      targets: [{ type: "project", id: "p1", name: "Website" }],
    });
    await acme.record({
      action: "project.updated",
      actor: ben,
      targets: [{ type: "project", id: "p1", name: "Website" }],
      before: { name: "Website", plan: "free", password: "a" },
      after: { name: "Website", plan: "pro", password: "b" },
    });
    await acme.record({
      action: "member.invited",
      actor: anna,
      targets: [{ type: "member", id: "m1", name: "carla@example.ch" }],
    });
    await audit.with({ tenantId: "globex" }).record({
      action: "project.deleted",
      actor: { id: "u_greta" },
      targets: [{ type: "project", id: "p9" }],
    });
    await audit.record({ action: "user.signed_in", actor: anna });
  });

  it("returns events newest first", async () => {
    const page = await audit.query();
    expect(page.events.map((e) => e.action)).toEqual([
      "user.signed_in",
      "project.deleted",
      "member.invited",
      "project.updated",
      "project.created",
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it("round-trips every field", async () => {
    const [event] = (await audit.query({ action: "project.updated" })).events;
    expect(event).toMatchObject({
      tenantId: "acme",
      actor: { id: "u_ben", type: "user", name: "Ben Keller" },
      targets: [{ type: "project", id: "p1", name: "Website" }],
      changes: [
        { field: "password", before: "[redacted]", after: "[redacted]" },
        { field: "plan", before: "free", after: "pro" },
      ],
      context: {},
      metadata: {},
    });
    expect(event?.occurredAt).toBe("2026-10-01T08:02:00.000Z");
    expect(await audit.get(event?.id as string)).toEqual(event);
  });

  it("scopes by tenant", async () => {
    const acme = audit.with({ tenantId: "acme" });
    expect((await acme.query()).events).toHaveLength(3);
    // A scoped log cannot be widened by the query.
    expect((await acme.query({ tenantId: "globex" })).events).toHaveLength(3);
    expect((await audit.query({ tenantId: null })).events.map((e) => e.action)).toEqual([
      "user.signed_in",
    ]);
    const globexId = (await audit.query({ tenantId: "globex" })).events[0]?.id as string;
    expect(await acme.get(globexId)).toBeNull();
  });

  it("filters by actor, action, prefix, target and type", async () => {
    expect((await audit.query({ actorId: "u_anna" })).events).toHaveLength(3);
    expect((await audit.query({ action: "project.*" })).events).toHaveLength(3);
    expect((await audit.query({ action: ["member.invited", "user.*"] })).events).toHaveLength(2);
    expect((await audit.query({ targetId: "p1" })).events).toHaveLength(2);
    expect((await audit.query({ targetType: "member" })).events).toHaveLength(1);
  });

  it("filters by time range", async () => {
    const page = await audit.query({
      from: "2026-10-01T08:02:00.000Z",
      to: "2026-10-01T08:04:00.000Z",
    });
    expect(page.events.map((e) => e.action)).toEqual(["member.invited", "project.updated"]);
  });

  it("searches actor, target and action case-insensitively", async () => {
    expect((await audit.query({ search: "KELLER" })).events).toHaveLength(1);
    expect((await audit.query({ search: "carla@" })).events).toHaveLength(1);
    expect((await audit.query({ search: "signed" })).events).toHaveLength(1);
    expect((await audit.query({ search: "100%" })).events).toHaveLength(0);
  });

  it("pages with a cursor, including events in the same millisecond", async () => {
    const same = new Date("2026-10-02T00:00:00.000Z");
    for (let i = 0; i < 4; i++) {
      await audit.record({ action: "file.uploaded", actor: ben, occurredAt: same });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await audit.query({ limit: 3, cursor });
      seen.push(...page.events.map((e) => e.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(9);
    expect(new Set(seen).size).toBe(9);
  });

  it("deletes old events for retention", async () => {
    const removed = await store.deleteBefore?.("2026-10-01T08:03:00.000Z", "acme");
    expect(removed).toBe(2);
    expect((await audit.query()).events).toHaveLength(3);
  });

  it("rewrites an actor for erasure requests and keeps search in sync", async () => {
    const changed = await store.rewriteActor?.("u_anna", {
      id: "erased-1",
      type: "user",
      name: "Deleted user",
    });
    expect(changed).toBe(3);
    expect((await audit.query({ search: "anna" })).events).toHaveLength(0);
    expect((await audit.query({ actorId: "erased-1" })).events).toHaveLength(3);
    expect((await audit.query({ search: "deleted user" })).events).toHaveLength(3);
  });
});
