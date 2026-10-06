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

### Slack and Microsoft Teams

`slackSink` and `teamsSink` post selected actions to chat channels, and `detectAnomalies` flags unusually many exports, deletions or failed logins. See [Alerts and anomalies](alerts.md).

### Your own sink

```ts
const bigQuery: Sink = { name: "bigquery", send: (events) => table.insert(events) }
```

## Evidence pack for auditors

ISO 27001, SOC 2 and financial supervisors ask for the same things: the events, proof that the log was not changed, and proof that your retention rules ran. `buildEvidencePack()` collects them in one package:

```ts
import { buildEvidencePack, verifyEvidencePack, zipFiles } from "@weber-development/logarithm-export"
import { verifyIntegrity } from "@weber-development/logarithm-integrity"
import { retentionReport, retentionReportCsv, retentionReportHtml } from "@weber-development/logarithm-retention"

const rows = await retentionReport(store, { tenantId: "acme" })
const { files, manifest } = await buildEvidencePack(store, {
  tenantId: "acme",
  from: "2026-01-01T00:00:00Z",
  to: "2026-09-30T23:59:59Z",
  title: "Audit evidence Q1 to Q3 2026",
  integrity: await verifyIntegrity(store, { key, tenantId: "acme", checkpoints }),
  checkpoints, // or timestamped checkpoints
  retention: { csv: retentionReportCsv(rows), html: retentionReportHtml(rows) },
  signingKey: key,
})
const zip = zipFiles(files) // send as application/zip
```

The pack contains `events.csv`, `events.ndjson`, `integrity-report.json`, `checkpoints.json`, the retention report, a `README.txt` and `manifest.json`. The manifest lists every file with its size and SHA-256, plus the tenant, period and event count. With `signingKey` it carries an HMAC signature, so a changed manifest is detected too. Add your own files (policies, notes) with `extra`.

`verifyEvidencePack(files, { signingKey })` re-computes all hashes and returns `{ ok, problems, signatureValid }`. An auditor can also check any file with `sha256sum` against the manifest, no software needed.
