import { describe, expect, it } from "vitest";
import {
  createAuditLog,
  fromCloudEvent,
  memoryStore,
  toCloudEvent,
  toOtelLogRecord,
  toOtlpLogs,
} from "../src/index";

async function sample(extra = {}) {
  const audit = createAuditLog({ store: memoryStore() });
  return audit.record({
    action: "project.updated",
    actor: { id: "u1", name: "Anna", email: "anna@example.ch" },
    tenantId: "acme",
    targets: [{ type: "project", id: "p1", name: "Website" }],
    before: { plan: "free" },
    after: { plan: "pro" },
    context: { ip: "203.0.113.7", userAgent: "Mozilla/5.0" },
    ...extra,
  });
}

describe("CloudEvents", () => {
  it("maps an event to the structured JSON format", async () => {
    const event = await sample({ correlationId: "req-1" });
    const ce = toCloudEvent(event, { source: "https://app.example/audit" });
    expect(ce).toMatchObject({
      specversion: "1.0",
      id: event.id,
      source: "https://app.example/audit",
      type: "audit.project.updated",
      time: event.occurredAt,
      subject: "project/p1",
      tenantid: "acme",
      outcome: "success",
      correlationid: "req-1",
      datacontenttype: "application/json",
    });
    expect(ce.data.changes).toEqual([{ field: "plan", before: "free", after: "pro" }]);
  });

  it("round-trips through fromCloudEvent, also after JSON", async () => {
    const event = await sample({ correlationId: "req-1", outcome: "denied" });
    const back = fromCloudEvent(JSON.parse(JSON.stringify(toCloudEvent(event))));
    expect(back).toEqual(event);
  });

  it("round-trips an event without tenant, outcome and targets", () => {
    const old = {
      id: "01A",
      occurredAt: "2026-01-01T00:00:00.000Z",
      tenantId: null,
      action: "user.signed_in",
      actor: { id: "u" },
      targets: [],
      changes: [],
      context: {},
      metadata: {},
    };
    const ce = toCloudEvent(old);
    expect(ce.subject).toBeUndefined();
    expect(ce.tenantid).toBeUndefined();
    expect(fromCloudEvent(ce)).toEqual(old);
  });

  it("rejects objects that are not Logarithm CloudEvents", () => {
    expect(() => fromCloudEvent({ specversion: "1.0" } as never)).toThrow("Not a CloudEvent");
  });
});

describe("OpenTelemetry", () => {
  it("maps outcome to severity and leaves out name and email", async () => {
    const ok = toOtelLogRecord(await sample());
    const denied = toOtelLogRecord(await sample({ outcome: "denied" }));
    const failed = toOtelLogRecord(await sample({ outcome: "failure" }));
    expect([ok.severityText, denied.severityText, failed.severityText]).toEqual([
      "INFO",
      "WARN",
      "ERROR",
    ]);
    expect(ok.body.stringValue).toBe("project.updated");
    const keys = ok.attributes.map((a) => a.key);
    expect(keys).toContain("enduser.id");
    expect(JSON.stringify(ok)).not.toContain("anna@example.ch");
    expect(JSON.stringify(ok)).not.toContain("Anna");
    expect(ok.attributes.find((a) => a.key === "client.address")).toEqual({
      key: "client.address",
      value: { stringValue: "203.0.113.7" },
    });
  });

  it("converts the time to nanoseconds without losing precision", async () => {
    const record = toOtelLogRecord(await sample({ occurredAt: "2026-10-12T10:00:00.123Z" }));
    expect(record.timeUnixNano).toBe("1791799200123000000");
  });

  it("uses a 32-character hex correlation id as the trace id", async () => {
    const trace = "4BF92F3577B34DA6A3CE929D0E0E4736";
    expect(toOtelLogRecord(await sample({ correlationId: trace })).traceId).toBe(
      trace.toLowerCase(),
    );
    expect(toOtelLogRecord(await sample({ correlationId: "req-1" })).traceId).toBeUndefined();
  });

  it("wraps records for POST /v1/logs", async () => {
    const body = toOtlpLogs([await sample()], { serviceName: "billing" });
    expect(body.resourceLogs[0]?.resource.attributes[0]).toEqual({
      key: "service.name",
      value: { stringValue: "billing" },
    });
    expect(body.resourceLogs[0]?.scopeLogs[0]?.logRecords).toHaveLength(1);
  });
});
