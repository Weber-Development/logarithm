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

### Elasticsearch, OpenSearch and Loki

```ts
import { elasticSink, lokiSink } from "@weber-development/logarithm-export"

elasticSink({ url: "https://es.example.ch:9200", index: "audit-log", apiKey: process.env.ES_KEY! })
lokiSink({ url: "https://loki.example.ch/loki/api/v1/push", orgId: "acme", labels: { env: "prod" } })
```

`elasticSink` uses the `_bulk` API with the event id as document id, so a redelivery never creates duplicates, and reports item errors that Elasticsearch hides inside a 200 response. `lokiSink` writes one JSON line per event and sets the action as a label (keep other labels few, Loki indexes them). Both accept `fetch` for proxies and tests, and basic auth, API key or bearer token.

### Retries and dead letters

A SIEM that is down for ten minutes should not cost you events. `withRetry` wraps any sink:

```ts
import { replayDeadLetters, withRetry, type DeadLetter } from "@weber-development/logarithm-export"

const siem = withRetry(splunkSink({ url, token }), {
  attempts: 5,            // total tries, default 4
  baseDelayMs: 500,       // doubled each time, with jitter
  deadLetter: (letter) => saveDeadLetter(letter), // after the last try: { sink, events, error, failedAt }
})

// from a cron job
const stillFailing = await replayDeadLetters(await loadDeadLetters(), siem)
```

Refused requests (4xx except 408 and 429, for example a wrong token) are not retried, because waiting will not fix them. After the last try the events go to `deadLetter` and the error is still thrown, so `onError` of `withForwarding` hears of it. Store dead letters wherever you keep durable data, for example a table or a bucket.

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

### Controls mapping (SOC 2, ISO 27001)

`mapControls()` shows which of your controls the log provides evidence for. Each control lists the actions that count as evidence, a minimum number of events, and gets a status: `evidenced`, `below-minimum` or `no-evidence`, with the number of events and a few samples. `SOC2_STARTER` and `ISO27001_STARTER` are starting points to adapt with your auditor; they are not a certification and do not replace one.

```ts
import { ISO27001_STARTER, SOC2_STARTER, controlReportHtml, mapControls } from "@weber-development/logarithm-export"

const rows = await mapControls(store, [...SOC2_STARTER, ...ISO27001_STARTER], {
  tenantId: "acme",
  from: "2026-01-01T00:00:00Z",
  to: "2026-10-01T00:00:00Z",
})
const html = controlReportHtml(rows, { title: "Controls Q1 to Q3 2026" }) // HTML-escaped; controlReportCsv(rows) for a spreadsheet
```

Pass the result as `controls` to `buildEvidencePack()` and the pack also contains `controls.json`, `controls.csv` and `controls.html`.

## Monthly evidence packs

`runMonthlyEvidence()` builds one pack per tenant for a calendar month (default: the previous one) and hands each ZIP to your `deliver` callback. Pass `integrity`, `checkpoints` and `signingKey` to include them in every pack. Running it twice for a month delivers the same file name twice, so make `deliver` overwrite. A failing tenant is reported and does not stop the others; `skipEmpty` leaves out tenants without events. Call it from a cron job on the first of the month.

```ts
import { ISO27001_STARTER, SOC2_STARTER, runMonthlyEvidence } from "@weber-development/logarithm-export"

const results = await runMonthlyEvidence({
  store,
  tenants: () => listTenantIds(),
  controls: [...SOC2_STARTER, ...ISO27001_STARTER],
  skipEmpty: true,
  deliver: ({ fileName, zip }) => upload(`evidence/${fileName}`, zip),
})
```

## Read-only access for auditors

Give an auditor a link instead of an export. `createAuditorAccess()` issues tokens (`lga1.…`) that are limited to one tenant, optionally a period and a set of actions, and expire after at most 90 days (default maximum; at least one minute). The endpoint is GET-only. Every request is written to your audit log first (`auditor.viewed`, `auditor.exported`, and `auditor.denied` for expired or revoked tokens); if that write fails, the request is answered with 503 and no data is returned. Responses are `no-store` and `noindex`.

```ts
import { createAuditorAccess } from "@weber-development/logarithm-export"

const access = createAuditorAccess({
  store,
  key: process.env.AUDITOR_KEY!,
  record: (entry) => audit.record(entry),
  baseUrl: "https://app.example.ch/api/auditor",
})
const { url, grant } = await access.issue({
  tenantId: "acme",
  auditor: "Dana Prüfer (KPMG)",
  expiresIn: "14d",
  scope: { from: "2026-01-01", to: "2027-01-01" },
  issuedBy: { id: user.id },
})
export const GET = access.handler
// later: await access.revoke(grant, { id: user.id }) (needs a `revocations` list)
```

The auditor opens the link; `?format=csv|ndjson|json` downloads an export, `?id=` shows one event, `?grant=1` shows the access itself. `<AuditLog endpoint="/api/auditor?token=…">` works as the auditor's view.

## Splunk and Datadog

`splunkSink()` and `datadogSink()` send events with their outcome (Datadog sets the log status from it), split large batches (Splunk 500 events by default, Datadog 1000 entries or 4.5 MB) and accept a `fetch` option for proxies or tests. Refused requests throw `SinkHttpError`, so `withRetry()` does not retry permanent 4xx answers. Splunk takes `fields`; Datadog takes `hostname` and `tags`.

## CSV columns in 2.0

The CSV export ends with two new columns, `outcome` and `correlation_id`. Existing columns keep their position. If you parse the CSV by column index, nothing moves; if you check the header line, update it.
