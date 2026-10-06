import type { AuditLog } from "./log";
import { createAuditLog } from "./log";
import type { AuditStore } from "./types";

/** Thrown when a store does not behave like an `AuditStore` must. */
export class ConformanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConformanceError";
  }
}

/** JSON with sorted keys, because stores like Postgres jsonb do not keep key order. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

function same(actual: unknown, expected: unknown, what: string): void {
  const a = stable(actual);
  const e = stable(expected);
  if (a !== e) throw new ConformanceError(`${what}: expected ${e}, got ${a}`);
}

/** Creates an empty store. Called before every check, so each one starts clean. */
export type StoreFactory = () => Promise<AuditStore> | AuditStore;

export interface ConformanceCheck {
  name: string;
  run(create: StoreFactory): Promise<void>;
}

const anna = { id: "u_anna", name: "Anna Muster", email: "anna@example.ch" };
const ben = { id: "u_ben", name: "Ben Keller" };

async function seeded(create: StoreFactory): Promise<{ audit: AuditLog; store: AuditStore }> {
  const store = await create();
  let clock = Date.parse("2026-10-01T08:00:00.000Z");
  const audit = createAuditLog({
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
    before: { plan: "free" },
    after: { plan: "pro" },
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
  return { audit, store };
}

const actions = (page: { events: { action: string }[] }) => page.events.map((e) => e.action);

/**
 * Checks that every store has to pass, so a store you write yourself behaves exactly like the
 * built-in ones: ordering, tenant isolation, filters, search, paging, counts and (when the store
 * implements them) retention and erasure.
 *
 * Works with any test runner:
 *
 * ```ts
 * for (const check of storeConformanceChecks) it(check.name, () => check.run(createMyStore))
 * ```
 */
export const storeConformanceChecks: ConformanceCheck[] = [
  {
    name: "returns events newest first",
    async run(create) {
      const { audit } = await seeded(create);
      const page = await audit.query();
      same(
        actions(page),
        [
          "user.signed_in",
          "project.deleted",
          "member.invited",
          "project.updated",
          "project.created",
        ],
        "order",
      );
      same(page.nextCursor, null, "nextCursor");
    },
  },
  {
    name: "round-trips every field and finds events by id",
    async run(create) {
      const { audit } = await seeded(create);
      const [event] = (await audit.query({ action: "project.updated" })).events;
      if (!event) throw new ConformanceError("event not found");
      same(event.tenantId, "acme", "tenantId");
      same(event.actor, { id: "u_ben", type: "user", name: "Ben Keller" }, "actor");
      same(event.targets, [{ type: "project", id: "p1", name: "Website" }], "targets");
      same(event.changes, [{ field: "plan", before: "free", after: "pro" }], "changes");
      same(event.occurredAt, "2026-10-01T08:02:00.000Z", "occurredAt");
      same(await audit.get(event.id), event, "get");
      same(await audit.get("does-not-exist"), null, "get of an unknown id");
    },
  },
  {
    name: "isolates tenants",
    async run(create) {
      const { audit } = await seeded(create);
      const acme = audit.with({ tenantId: "acme" });
      same((await acme.query()).events.length, 3, "events of acme");
      same(
        (await acme.query({ tenantId: "globex" })).events.length,
        3,
        "a scoped log cannot be widened",
      );
      same(
        actions(await audit.query({ tenantId: null })),
        ["user.signed_in"],
        "events without tenant",
      );
      const globexId = (await audit.query({ tenantId: "globex" })).events[0]?.id as string;
      same(await acme.get(globexId), null, "get across tenants");
    },
  },
  {
    name: "filters by actor, action, prefix, target and type",
    async run(create) {
      const { audit } = await seeded(create);
      same((await audit.query({ actorId: "u_anna" })).events.length, 3, "actorId");
      same((await audit.query({ action: "project.*" })).events.length, 3, "action prefix");
      same(
        (await audit.query({ action: ["member.invited", "user.*"] })).events.length,
        2,
        "action list",
      );
      same((await audit.query({ targetId: "p1" })).events.length, 2, "targetId");
      same((await audit.query({ targetType: "member" })).events.length, 1, "targetType");
    },
  },
  {
    name: "filters by time range, both ends inclusive",
    async run(create) {
      const { audit } = await seeded(create);
      const page = await audit.query({
        from: "2026-10-01T08:02:00.000Z",
        to: "2026-10-01T08:04:00.000Z",
      });
      same(actions(page), ["member.invited", "project.updated"], "range");
    },
  },
  {
    name: "searches case-insensitively and treats wildcards literally",
    async run(create) {
      const { audit } = await seeded(create);
      same((await audit.query({ search: "KELLER" })).events.length, 1, "case");
      same((await audit.query({ search: "carla@" })).events.length, 1, "target name");
      same((await audit.query({ search: "signed" })).events.length, 1, "action");
      for (const literal of ["100%", "anna_", "!", "\\"]) {
        same((await audit.query({ search: literal })).events.length, 0, `search ${literal}`);
      }
    },
  },
  {
    name: "pages with a cursor, also across events in the same millisecond",
    async run(create) {
      const { audit } = await seeded(create);
      const same_ms = new Date("2026-10-02T00:00:00.000Z");
      for (let i = 0; i < 4; i++) {
        await audit.record({ action: "file.uploaded", actor: ben, occurredAt: same_ms });
      }
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await audit.query({ limit: 3, cursor });
        seen.push(...page.events.map((e) => e.id));
        cursor = page.nextCursor;
      } while (cursor);
      same(seen.length, 9, "events seen");
      same(new Set(seen).size, 9, "duplicates between pages");
    },
  },
  {
    name: "counts with the same filters as query, also grouped",
    async run(create) {
      const { audit } = await seeded(create);
      same(await audit.count(), 5, "all");
      same(await audit.count({ action: "project.*" }), 3, "prefix");
      same(await audit.count({ tenantId: null }), 1, "no tenant");
      same(await audit.count({ search: "keller" }), 1, "search");
      same(await audit.with({ tenantId: "acme" }).count({ tenantId: "globex" }), 3, "scoped");
      same(await audit.count({ groupBy: "day" }), [{ key: "2026-10-01", count: 5 }], "by day");
      same(
        await audit.count({ groupBy: "action", tenantId: null }),
        [{ key: "user.signed_in", count: 1 }],
        "by action",
      );
      same(await audit.count({ groupBy: "action", actorId: "nobody" }), [], "empty group");
    },
  },
  {
    name: "deletes old events for retention (when deleteBefore exists)",
    async run(create) {
      const { audit, store } = await seeded(create);
      if (!store.deleteBefore) return;
      same(await store.deleteBefore("2026-10-01T08:03:00.000Z", "acme"), 2, "deleted");
      same((await audit.query()).events.length, 3, "left");
    },
  },
  {
    name: "rewrites an actor for erasure and keeps search in sync (when rewriteActor exists)",
    async run(create) {
      const { audit, store } = await seeded(create);
      if (!store.rewriteActor) return;
      same(
        await store.rewriteActor("u_anna", { id: "erased-1", type: "user", name: "Deleted user" }),
        3,
        "rewritten",
      );
      same((await audit.query({ search: "anna" })).events.length, 0, "old name still searchable");
      same((await audit.query({ actorId: "erased-1" })).events.length, 3, "new actor id");
      same((await audit.query({ search: "deleted user" })).events.length, 3, "new name");
    },
  },
];

/** Runs all checks and returns the failures, for a quick script instead of a test runner. */
export async function runStoreConformance(
  create: StoreFactory,
): Promise<{ name: string; error: string }[]> {
  const failures: { name: string; error: string }[] = [];
  for (const check of storeConformanceChecks) {
    try {
      await check.run(create);
    } catch (error) {
      failures.push({
        name: check.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return failures;
}
