---
title: Export formats
description: Send events to CloudEvents consumers and OpenTelemetry backends.
---

Audit events are most useful when they also reach the tools your platform team already runs. Logarithm maps an event to two open standards. Both functions are pure: they do not send anything, so you choose the transport.

## CloudEvents

[CloudEvents](https://cloudevents.io) 1.0 is the envelope that Knative, AWS EventBridge, Azure Event Grid, Google Eventarc and most message brokers understand.

```ts
import { toCloudEvent, fromCloudEvent } from "@sweberdev/logarithm"

const ce = toCloudEvent(event, { source: "https://app.example.ch/audit", typePrefix: "ch.example.audit" })
await fetch(sink, {
  method: "POST",
  headers: { "content-type": "application/cloudevents+json" },
  body: JSON.stringify(ce),
})
```

| CloudEvents attribute | From |
|---|---|
| `id` | `event.id` |
| `source` | `options.source`, default `urn:logarithm:audit` |
| `type` | `<typePrefix>.<action>`, e.g. `audit.project.updated` |
| `time` | `occurredAt` |
| `subject` | The first target as `type/id`, e.g. `project/p1` |
| `tenantid`, `outcome`, `correlationid` | Extension attributes, left out when empty |
| `data` | `action`, `actor`, `targets`, `changes`, `context`, `metadata` |

`fromCloudEvent` reads an envelope written by `toCloudEvent` back into an `AuditEvent`, for example to import events from another system's archive. It throws on any other envelope.

## OpenTelemetry

`toOtelLogRecord(event)` returns an OTLP/JSON log record and `toOtlpLogs(events, { serviceName })` wraps records in the body of `POST /v1/logs`, which the OpenTelemetry Collector, Grafana, Datadog and Honeycomb accept.

```ts
import { toOtlpLogs } from "@sweberdev/logarithm"

await fetch("http://otel-collector:4318/v1/logs", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(toOtlpLogs(events, { serviceName: "billing" })),
})
```

- The body is the action. Severity follows the outcome: success `INFO`, denied `WARN`, failure `ERROR`.
- A correlation id of 32 hexadecimal characters (a W3C trace id) becomes the record's `traceId`, so the audit event appears next to the trace of the request that caused it.
- Attributes: `event.name` (the action), `enduser.id`, `client.address`, `user_agent.original` and `logarithm.*` for event id, tenant, outcome, actor type, correlation id, target ids and types, and the changes.
- Name and email of the actor are not sent, only the actor id. Changes are already redacted, but check what your field names expose before you ship events to a third party.

For continuous forwarding with retries and a dead-letter list, see [Logarithm Pro](../pro/export.md).
