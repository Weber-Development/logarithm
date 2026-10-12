import type { AuditEvent, AuditOutcome } from "./types";

// --- CloudEvents 1.0 ------------------------------------------------------------------------

/** An audit event as a CloudEvents 1.0 structured-mode JSON object. */
export interface CloudEvent {
  specversion: "1.0";
  id: string;
  source: string;
  type: string;
  time: string;
  subject?: string;
  datacontenttype: "application/json";
  /** The tenant, or absent for events without one. */
  tenantid?: string;
  outcome?: AuditOutcome;
  correlationid?: string;
  data: Pick<AuditEvent, "action" | "actor" | "targets" | "changes" | "context" | "metadata">;
}

export interface CloudEventOptions {
  /** Identifies the system that produced the event, a URI reference. Default `urn:logarithm:audit`. */
  source?: string;
  /** The `type` is this prefix, a dot and the action. Default `audit`. */
  typePrefix?: string;
}

/**
 * Maps an event to a CloudEvents 1.0 envelope, ready to send to any CloudEvents consumer (Knative,
 * EventBridge, Azure Event Grid, Kafka). `type` is `<typePrefix>.<action>`, `subject` is the first
 * target as `type/id`, and tenant, outcome and correlation id travel as extension attributes.
 * Use {@link fromCloudEvent} to read one back.
 */
export function toCloudEvent(event: AuditEvent, options: CloudEventOptions = {}): CloudEvent {
  const first = event.targets[0];
  const out: CloudEvent = {
    specversion: "1.0",
    id: event.id,
    source: options.source ?? "urn:logarithm:audit",
    type: `${options.typePrefix ?? "audit"}.${event.action}`,
    time: event.occurredAt,
    datacontenttype: "application/json",
    data: {
      action: event.action,
      actor: event.actor,
      targets: event.targets,
      changes: event.changes,
      context: event.context,
      metadata: event.metadata,
    },
  };
  if (first) out.subject = `${first.type}/${first.id}`;
  if (event.tenantId !== null) out.tenantid = event.tenantId;
  if (event.outcome) out.outcome = event.outcome;
  if (event.correlationId) out.correlationid = event.correlationId;
  return out;
}

/** Reads an event written by {@link toCloudEvent}. Throws on anything else. */
export function fromCloudEvent(cloudEvent: CloudEvent): AuditEvent {
  const d = cloudEvent?.data;
  if (
    cloudEvent?.specversion !== "1.0" ||
    typeof cloudEvent.id !== "string" ||
    typeof cloudEvent.time !== "string" ||
    !d ||
    typeof d.action !== "string" ||
    !d.actor ||
    typeof d.actor.id !== "string"
  ) {
    throw new TypeError("Not a CloudEvent written by Logarithm");
  }
  const event: AuditEvent = {
    id: cloudEvent.id,
    occurredAt: new Date(cloudEvent.time).toISOString(),
    tenantId: cloudEvent.tenantid ?? null,
    action: d.action,
    actor: d.actor,
    targets: d.targets ?? [],
    changes: d.changes ?? [],
    context: d.context ?? {},
    metadata: d.metadata ?? {},
  };
  if (cloudEvent.outcome) event.outcome = cloudEvent.outcome;
  if (cloudEvent.correlationid) event.correlationId = cloudEvent.correlationid;
  return event;
}

// --- OpenTelemetry logs ---------------------------------------------------------------------

type AnyValue = { stringValue: string } | { arrayValue: { values: { stringValue: string }[] } };

/** An OTLP/JSON log record (`opentelemetry.proto.logs.v1.LogRecord`). */
export interface OtelLogRecord {
  timeUnixNano: string;
  observedTimeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: { stringValue: string };
  attributes: { key: string; value: AnyValue }[];
  /** Set when the correlation id is a 32-character hex trace id. */
  traceId?: string;
}

const SEVERITY: Record<AuditOutcome, [number, string]> = {
  success: [9, "INFO"],
  denied: [13, "WARN"],
  failure: [17, "ERROR"],
};

const str = (value: string): { stringValue: string } => ({ stringValue: value });

function nanos(iso: string): string {
  return (BigInt(new Date(iso).getTime()) * 1_000_000n).toString();
}

/**
 * Maps an event to an OpenTelemetry log record. The body is the action, severity follows the
 * outcome (success `INFO`, denied `WARN`, failure `ERROR`), and a correlation id that is a W3C
 * trace id (32 hex characters) becomes `traceId`, so the audit event shows up next to the trace.
 * Attributes use the semantic-convention names `event.name`, `enduser.id`, `client.address` and
 * `user_agent.original`; the rest is under `logarithm.*`. Name and email of the actor are not
 * sent, only its id.
 */
export function toOtelLogRecord(event: AuditEvent): OtelLogRecord {
  const outcome = event.outcome ?? "success";
  const [severityNumber, severityText] = SEVERITY[outcome];
  const attributes: OtelLogRecord["attributes"] = [
    { key: "event.name", value: str(event.action) },
    { key: "enduser.id", value: str(event.actor.id) },
    { key: "logarithm.event.id", value: str(event.id) },
    { key: "logarithm.outcome", value: str(outcome) },
  ];
  if (event.actor.type)
    attributes.push({ key: "logarithm.actor.type", value: str(event.actor.type) });
  if (event.tenantId !== null)
    attributes.push({ key: "logarithm.tenant.id", value: str(event.tenantId) });
  if (event.correlationId) {
    attributes.push({ key: "logarithm.correlation_id", value: str(event.correlationId) });
  }
  if (event.targets.length > 0) {
    attributes.push(
      {
        key: "logarithm.target.ids",
        value: { arrayValue: { values: event.targets.map((t) => str(t.id)) } },
      },
      {
        key: "logarithm.target.types",
        value: { arrayValue: { values: event.targets.map((t) => str(t.type)) } },
      },
    );
  }
  if (event.changes.length > 0) {
    attributes.push({ key: "logarithm.changes", value: str(JSON.stringify(event.changes)) });
  }
  if (event.context.ip) attributes.push({ key: "client.address", value: str(event.context.ip) });
  if (event.context.userAgent) {
    attributes.push({ key: "user_agent.original", value: str(event.context.userAgent) });
  }
  const record: OtelLogRecord = {
    timeUnixNano: nanos(event.occurredAt),
    observedTimeUnixNano: nanos(event.occurredAt),
    severityNumber,
    severityText,
    body: str(event.action),
    attributes,
  };
  if (event.correlationId && /^[0-9a-f]{32}$/i.test(event.correlationId)) {
    record.traceId = event.correlationId.toLowerCase();
  }
  return record;
}

/**
 * The body for `POST /v1/logs` of an OTLP/HTTP endpoint (OpenTelemetry Collector, Grafana, Datadog,
 * Honeycomb) with `content-type: application/json`.
 */
export function toOtlpLogs(
  events: AuditEvent[],
  options: { serviceName?: string } = {},
): {
  resourceLogs: {
    resource: { attributes: { key: string; value: AnyValue }[] };
    scopeLogs: { scope: { name: string }; logRecords: OtelLogRecord[] }[];
  }[];
} {
  return {
    resourceLogs: [
      {
        resource: {
          attributes: [{ key: "service.name", value: str(options.serviceName ?? "audit-log") }],
        },
        scopeLogs: [
          { scope: { name: "@sweberdev/logarithm" }, logRecords: events.map(toOtelLogRecord) },
        ],
      },
    ],
  };
}
