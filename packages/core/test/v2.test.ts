import { describe, expect, it } from "vitest";
import {
  AuditQueryError,
  AuditValidationError,
  createAuditHandler,
  createAuditLog,
  memoryStore,
} from "../src/index";

describe("outcome and correlation id", () => {
  it("defaults the outcome to success and takes the correlation id from the defaults", async () => {
    const audit = createAuditLog({ store: memoryStore() }).with({ correlationId: "trace-1" });
    const ok = await audit.record({ action: "file.read", actor: { id: "u" } });
    expect(ok.outcome).toBe("success");
    expect(ok.correlationId).toBe("trace-1");
    const own = await audit.record({
      action: "file.read",
      actor: { id: "u" },
      outcome: "denied",
      correlationId: "trace-2",
    });
    expect(own).toMatchObject({ outcome: "denied", correlationId: "trace-2" });
  });

  it("leaves the correlation id out when none is given", async () => {
    const audit = createAuditLog({ store: memoryStore() });
    const event = await audit.record({ action: "file.read", actor: { id: "u" } });
    expect("correlationId" in event).toBe(false);
  });

  it("rejects an unknown outcome and an empty or oversized correlation id", async () => {
    const audit = createAuditLog({ store: memoryStore() });
    const base = { action: "a.b", actor: { id: "u" } };
    await expect(audit.record({ ...base, outcome: "maybe" as never })).rejects.toBeInstanceOf(
      AuditValidationError,
    );
    await expect(audit.record({ ...base, correlationId: "" })).rejects.toBeInstanceOf(
      AuditValidationError,
    );
    await expect(audit.record({ ...base, correlationId: "x".repeat(191) })).rejects.toBeInstanceOf(
      AuditValidationError,
    );
    await expect(audit.query({ outcome: "maybe" as never })).rejects.toBeInstanceOf(
      AuditQueryError,
    );
  });

  it("filters over HTTP with outcome= and correlation=", async () => {
    const audit = createAuditLog({ store: memoryStore() });
    await audit.record({
      action: "a.b",
      actor: { id: "u" },
      outcome: "failure",
      correlationId: "c1",
    });
    await audit.record({ action: "a.b", actor: { id: "u" } });
    const handler = createAuditHandler({ log: audit, authorize: () => ({ tenantId: null }) });
    const failures = await (await handler(new Request("https://x.test/?outcome=failure"))).json();
    expect(failures.events).toHaveLength(1);
    const byTrace = await (await handler(new Request("https://x.test/?correlation=c1"))).json();
    expect(byTrace.events).toHaveLength(1);
    expect((await handler(new Request("https://x.test/?outcome=bogus"))).status).toBe(400);
  });
});
