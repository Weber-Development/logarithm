---
title: Retention and privacy
description: Retention periods, archives, erasure and access requests.
---

## Retention periods

```ts
import { applyRetention, toNdjson } from "@weber-development/logarithm-retention"

await applyRetention(store, tenantIds, {
  keep: "13m",                     // 13 × 30 days
  tenants: { "bank-ag": "10y" },   // longer for customers who need it
  archive: async (events, { tenantId }) => {
    await bucket.put(`audit/${tenantId}/${events[0].occurredAt}.ndjson`, toNdjson(events))
  },
})
```

Durations: `36h`, `90d`, `12w`, `13m` (30 days each), `7y` (365 days each). With `archive`, events are handed over oldest first in batches of 1000 before they are deleted. `dryRun: true` only counts. Run it daily.

## Archive to S3 or Cloudflare R2

`s3Archive()` gives you a ready `archive` function. Each batch becomes one gzipped NDJSON object, `audit/<tenant>/<first event time>_<last event id>.ndjson.gz`. It signs with Web Crypto, so it runs in Node, Bun, Deno and edge runtimes without the AWS SDK.

```ts
import { applyRetention, s3Archive } from "@weber-development/logarithm-retention"

const archive = s3Archive({
  bucket: "audit-archive",
  endpoint: `https://${process.env.R2_ACCOUNT}.r2.cloudflarestorage.com`, // R2 (region "auto")
  accessKeyId: process.env.R2_KEY!,
  secretAccessKey: process.env.R2_SECRET!,
})

await applyRetention(store, tenantIds, { keep: "13m", archive })
```

For AWS, pass `region: "eu-central-2"` instead of `endpoint`. For Exoscale, Infomaniak, MinIO or other S3-compatible stores, pass their `endpoint` and `region`. Options: `prefix` (default `audit/`), `gzip` (default `true`). A failed upload throws, so nothing is deleted without its archive.

## Recording what retention did

Pass your audit log as `recordTo`, and the log documents its own maintenance:

```ts
await applyRetention(store, tenantIds, { keep: "13m", archive, recordTo: audit })
await eraseActor(store, "user_123", { key: process.env.AUDIT_KEY!, recordTo: audit })
```

`applyRetention` records `audit_log.retention_applied` per tenant where events were deleted, with `keep`, `cutoff`, `archived` and `deleted` in `metadata`. `eraseActor` records `audit_log.actor_erased` with the pseudonym and counts, never the original id. Both use the actor `system:retention`. Dry runs record nothing.

## Report for audits

`retentionReport()` reads the entries recorded with `recordTo` and returns one row per retention run or erasure, oldest first. Add the legal basis per tenant, then hand the auditor a CSV or a printable page:

```ts
import { retentionReport, retentionReportCsv, retentionReportHtml } from "@weber-development/logarithm-retention"

const rows = await retentionReport(store, {
  from: "2026-01-01T00:00:00Z",
  legalBasis: { "bank-ag": "FINMA, 10 years", "*": "Contract, 13 months" },
})
const csv = retentionReportCsv(rows)
const html = retentionReportHtml(rows, { title: "Retention report 2026" }) // print to PDF from the browser
```

Columns: date, type, tenant, period, deleted-before time, archived, deleted or rewritten, pseudonym, legal basis, hold. Values that start with `=`, `+`, `-` or `@` are neutralised in the CSV, so spreadsheets never run them as formulas.

## Erasure requests

```ts
import { eraseActor } from "@weber-development/logarithm-retention"

const result = await eraseActor(store, "user_123", { key: process.env.AUDIT_KEY! })
// { actor: { id: "erased_3f9a…", type: "erased", name: "Deleted user" }, rewritten: 41, mentionedIn: ["01J…"] }
```

The person's id, name and email are replaced in every event they performed. The pseudonym is derived with an HMAC, so all their events still group together and the log stays readable, without revealing who it was. Events that mention the person as a target are listed in `mentionedIn` for you to review, because those may be needed as evidence.

With [tamper evidence](integrity.md), erased events still verify.

## Legal holds

During litigation, an authority's request or an internal investigation, data must be kept even if its period has passed. Pass the holds to both functions:

```ts
const holds = { tenants: ["bank-ag"], actors: ["user_123"] }

await applyRetention(store, tenantIds, { keep: "13m", holds })
await eraseActor(store, "user_123", { key, holds }) // throws LegalHoldError
```

A tenant on hold is skipped completely (`held: "tenant"` in the result). For a person on hold, the cutoff moves back to their oldest event in the tenant, as actor or target, so nothing about them is deleted (`held: "actor"`). Stores delete by time, so other events from that day on are kept too until the hold is lifted.

## Access requests

```ts
const data = await exportActorData(store, "user_123", { tenantId: "acme" })
// { performed: AuditEvent[], concerning: AuditEvent[] }
```

`performed` holds what the person did, `concerning` what others did to them. Hand it over as JSON or render it.

These functions help you answer requests under the GDPR (Art. 15, 17) and the Swiss FADP (Art. 25, 32). Whether and how far you must erase or disclose is a legal question; get advice.
