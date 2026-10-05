---
title: Export and forwarding
description: Downloads for your customers and delivery to SIEM tools.
---

## Downloads

Enterprise customers want to pull their log into Excel or their own tools.

```ts
// app/api/audit/export/route.ts
import { createExportHandler } from "@weber-development/logarithm-export"

export const GET = createExportHandler({
  store,
  async authorize() {
    const session = await getSession()
    return session?.role === "admin" ? { tenantId: session.orgId } : null
  },
})
```

`GET /api/audit/export?format=csv&from=2026-01-01&action=member.*` streams the file, so large exports need no memory for all rows. Formats: `csv` (with BOM for Excel, formulas neutralised), `ndjson`, `json`. For your own pipeline use `exportEvents(store, query, format)`, an async iterator of chunks.

## Forwarding

Security teams want audit events in their SIEM. `withForwarding` sends every stored event to one or more sinks. The database stays the source of truth; a failing sink never fails the write and is reported to `onError`.

```ts
import { datadogSink, splunkSink, webhookSink, withForwarding } from "@weber-development/logarithm-export"

const store = withForwarding(postgresStore({ client: pool }), [
  splunkSink({ url: "https://splunk.example.ch:8088/services/collector/event", token: process.env.HEC_TOKEN! }),
  datadogSink({ apiKey: process.env.DD_API_KEY!, site: "datadoghq.eu" }),
  webhookSink({ url: "https://hooks.customer.ch/audit", secret: process.env.HOOK_SECRET! }),
])
```

### Webhooks

The body is `{ "events": [...] }`. The header `x-logarithm-signature: t=<unix seconds>,v1=<hex>` carries an HMAC-SHA256 of `"<t>.<body>"`, like Stripe. Receivers check it with `verifyWebhook(body, header, secret)`, which also rejects signatures older than five minutes.

### Your own sink

```ts
const bigQuery: Sink = { name: "bigquery", send: (events) => table.insert(events) }
```
