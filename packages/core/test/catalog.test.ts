import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type AuditEvent,
  AuditQueryError,
  type AuditStore,
  createAuditHandler,
  createAuditLog,
  memoryStore,
} from "../src/index";

// An action catalog: action name → metadata type. Interfaces work as well as type aliases.
interface InvoiceMeta {
  amount: number;
  currency: "CHF" | "EUR";
}
type Actions = {
  "project.created": Record<string, never>;
  "project.updated": { reason?: string };
  "invoice.paid": InvoiceMeta;
  "member.role.changed": { role: "admin" | "viewer" };
};

describe("typed action catalog", () => {
  it("accepts catalog actions and checks their metadata at compile time", async () => {
    const audit = createAuditLog<Actions>({ store: memoryStore() }).with({
      actor: { id: "u1" },
    });
    const paid = await audit.record({
      action: "invoice.paid",
      metadata: { amount: 120, currency: "CHF" },
    });
    expectTypeOf(paid.action).toEqualTypeOf<
      "project.created" | "project.updated" | "invoice.paid" | "member.role.changed"
    >();
    await audit.record({ action: "project.created" });
    await audit.record({ action: "project.updated", metadata: { reason: "rename" } });
    await audit.recordMany([
      { action: "project.updated" },
      { action: "member.role.changed", metadata: { role: "admin" } },
    ]);

    // Compile-time checks only; never called.
    const rejected = () => {
      // @ts-expect-error unknown action
      audit.record({ action: "project.renamed" });
      // @ts-expect-error metadata is required for invoice.paid
      audit.record({ action: "invoice.paid" });
      // @ts-expect-error wrong metadata type
      audit.record({ action: "invoice.paid", metadata: { amount: "120", currency: "CHF" } });
      // @ts-expect-error unknown prefix
      audit.query({ action: "billing.*" });
      // @ts-expect-error unknown action in count
      audit.count({ action: "project.renamed" });
    };
    expect(rejected).toBeTypeOf("function");

    expect((await audit.query({ action: "member.*" })).events).toHaveLength(1);
    expect((await audit.query({ action: "member.role.*" })).events).toHaveLength(1);
    expect(await audit.count({ action: ["project.*", "invoice.paid"] })).toBe(4);
    expect(await audit.count({ action: "*" })).toBe(5);
  });

  it("keeps an untyped log accepting any action, and both work with the handler", async () => {
    const store = memoryStore();
    const untyped = createAuditLog({ store });
    const event: AuditEvent = await untyped.record({
      action: "anything.goes",
      actor: { id: "u" },
      metadata: { free: true },
    });
    expect(event.action).toBe("anything.goes");
    createAuditHandler({ log: untyped, authorize: () => ({ tenantId: null }) });
    createAuditHandler({
      log: createAuditLog<Actions>({ store }),
      authorize: () => ({ tenantId: null }),
    });
  });
});

describe("count", () => {
  it("falls back to paging through query for stores without count", async () => {
    const inner = memoryStore();
    const store: AuditStore = {
      insert: (e) => inner.insert(e),
      query: (q) => inner.query(q),
      get: (id) => inner.get(id),
    };
    const audit = createAuditLog({ store }).with({ actor: { id: "u" } });
    await audit.recordMany(
      Array.from({ length: 1203 }, (_, i) => ({
        action: i % 3 === 0 ? "file.deleted" : "file.uploaded",
        occurredAt: new Date(Date.UTC(2026, 9, 1 + (i % 2))),
      })),
    );
    expect(await audit.count()).toBe(1203);
    expect(await audit.count({ action: "file.deleted" })).toBe(401);
    expect(await audit.count({ groupBy: "action" })).toEqual([
      { key: "file.uploaded", count: 802 },
      { key: "file.deleted", count: 401 },
    ]);
    expect(await audit.count({ groupBy: "day" })).toEqual([
      { key: "2026-10-01", count: 602 },
      { key: "2026-10-02", count: 601 },
    ]);
  });

  it("rejects an unknown groupBy and invalid dates", async () => {
    const audit = createAuditLog({ store: memoryStore() });
    await expect(audit.count({ groupBy: "month" as never })).rejects.toThrow(AuditQueryError);
    await expect(audit.count({ from: "yesterday" })).rejects.toThrow(AuditQueryError);
  });
});
