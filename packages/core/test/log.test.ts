import { describe, expect, it } from "vitest";
import {
  AuditQueryError,
  AuditValidationError,
  createAuditHandler,
  createAuditLog,
  describeAction,
  diff,
  memoryStore,
  ulid,
} from "../src/index";

describe("diff", () => {
  it("reports nested fields as dot paths and compares arrays as a whole", () => {
    expect(
      diff(
        { name: "A", billing: { plan: "free", seats: 1 }, tags: ["x"], same: 1 },
        { name: "B", billing: { plan: "pro", seats: 1 }, tags: ["x", "y"], same: 1, added: true },
      ),
    ).toEqual([
      { field: "added", after: true },
      { field: "billing.plan", before: "free", after: "pro" },
      { field: "name", before: "A", after: "B" },
      { field: "tags", before: ["x"], after: ["x", "y"] },
    ]);
  });

  it("redacts sensitive fields, also inside added objects", () => {
    expect(
      diff({}, { apiKey: "k", credentials: { token: "t", user: "u" }, secret: { a: 1 } }),
    ).toEqual([
      { field: "apiKey", after: "[redacted]" },
      { field: "credentials", after: { token: "[redacted]", user: "u" } },
      { field: "secret", after: "[redacted]" },
    ]);
  });

  it("ignores listed fields and normalises dates", () => {
    const d1 = new Date("2026-01-01T00:00:00Z");
    expect(
      diff(
        { updatedAt: 1, due: d1 },
        { updatedAt: 2, due: new Date(d1) },
        { ignore: ["updatedAt"] },
      ),
    ).toEqual([]);
  });
});

describe("createAuditLog", () => {
  it("validates input", async () => {
    const audit = createAuditLog({ store: memoryStore() });
    await expect(audit.record({ action: "bad action", actor: { id: "u" } })).rejects.toThrow(
      AuditValidationError,
    );
    await expect(audit.record({ action: "a.b" })).rejects.toThrow("actor.id");
    await expect(
      audit.record({ action: "a.b", actor: { id: "u" }, changes: [], before: {}, after: {} }),
    ).rejects.toThrow("either");
    await expect(
      audit.record({ action: "a.b", actor: { id: "u" }, targets: [{ id: "x" } as never] }),
    ).rejects.toThrow("target");
  });

  it("applies defaults and redacts metadata and explicit changes", async () => {
    const audit = createAuditLog({ store: memoryStore() }).with({
      tenantId: "t1",
      actor: { id: "u1" },
      context: { ip: "203.0.113.5" },
    });
    const event = await audit.record({
      action: "settings.updated",
      context: { requestId: "r1" },
      metadata: { reason: "x", token: "secret" },
      changes: [{ field: "smtp.password", before: "a", after: "b" }],
    });
    expect(event.tenantId).toBe("t1");
    expect(event.actor).toEqual({ id: "u1", type: "user" });
    expect(event.context).toEqual({ ip: "203.0.113.5", requestId: "r1" });
    expect(event.metadata).toEqual({ reason: "x", token: "[redacted]" });
    expect(event.changes).toEqual([
      { field: "smtp.password", before: "[redacted]", after: "[redacted]" },
    ]);
  });

  it("rejects bad limits and cursors", async () => {
    const audit = createAuditLog({ store: memoryStore() });
    await expect(audit.query({ limit: 0 })).rejects.toThrow(AuditQueryError);
    await expect(audit.query({ cursor: "nope" })).rejects.toThrow(AuditQueryError);
  });
});

describe("ulid", () => {
  it("is monotonic within a millisecond", () => {
    const ids = Array.from({ length: 50 }, () => ulid(1_700_000_000_000));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(50);
    expect(ids[0]).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});

describe("describeAction", () => {
  it("builds short sentences in English and German", () => {
    const event = {
      action: "project.updated",
      targets: [{ type: "project", id: "p", name: "Website" }],
    };
    expect(describeAction(event)).toBe('updated project "Website"');
    expect(describeAction(event, { locale: "de-CH", nouns: { project: "Projekt" } })).toBe(
      "hat Projekt „Website“ geändert",
    );
    expect(describeAction({ action: "user.signed_in", targets: [] }, { locale: "de" })).toBe(
      "hat sich angemeldet",
    );
    expect(describeAction({ action: "api_key.rotated", targets: [] })).toBe("rotated api key");
    expect(describeAction({ action: "user.signed_in", targets: [] })).toBe("signed in");
    expect(
      describeAction(
        { action: "member.role_changed", targets: [{ type: "member", id: "m", name: "x@y.ch" }] },
        { locale: "de" },
      ),
    ).toBe("hat die Rolle von member „x@y.ch“ geändert");
  });
});

describe("createAuditHandler", () => {
  const audit = createAuditLog({ store: memoryStore() });
  const handler = createAuditHandler({
    log: audit,
    authorize: (req) => (req.headers.get("x-user") === "admin" ? { tenantId: "acme" } : null),
  });

  it("answers 403 without access and 405 for other methods", async () => {
    expect((await handler(new Request("https://x.test/audit"))).status).toBe(403);
    expect((await handler(new Request("https://x.test/audit", { method: "POST" }))).status).toBe(
      405,
    );
  });

  it("returns only the caller's tenant and parses filters", async () => {
    await audit
      .with({ tenantId: "acme" })
      .record({ action: "project.created", actor: { id: "u1" } });
    await audit
      .with({ tenantId: "acme" })
      .record({ action: "member.invited", actor: { id: "u1" } });
    await audit
      .with({ tenantId: "other" })
      .record({ action: "project.created", actor: { id: "u2" } });
    const res = await handler(
      new Request("https://x.test/audit?action=project.*,member.invited&limit=1", {
        headers: { "x-user": "admin" },
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].tenantId).toBe("acme");
    expect(body.nextCursor).toEqual(expect.any(String));
    const other = (await audit.query({ tenantId: "other" })).events[0]?.id;
    const single = await handler(
      new Request(`https://x.test/audit?id=${other}`, { headers: { "x-user": "admin" } }),
    );
    expect(single.status).toBe(404);
    const bad = await handler(
      new Request("https://x.test/audit?cursor=zz", { headers: { "x-user": "admin" } }),
    );
    expect(bad.status).toBe(400);
  });
});
