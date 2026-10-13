---
title: Logarithm Pro
description: Tamper evidence, retention and privacy requests, export, forwarding, alerts and a ready-to-run admin server.
---

The free packages record and show events. Logarithm Pro adds what enterprise customers, auditors and data protection officers ask for next.

| Package | What it adds |
|---|---|
| `@weber-development/logarithm-integrity` | [Tamper evidence](integrity.md): every event is linked to the previous one with an HMAC hash chain; a verifier shows which event was changed, removed or reordered |
| `@weber-development/logarithm-retention` | [Retention and privacy](retention.md): retention periods per customer with archiving, GDPR and Swiss FADP erasure with a stable pseudonym, access-request export |
| `@weber-development/logarithm-export` | [Export and forwarding](export.md): streamed CSV, NDJSON and JSON downloads for your customers, delivery to signed webhooks, Splunk and Datadog, SOC 2 / ISO 27001 controls mapping, monthly evidence packs and read-only [auditor access](export.md#read-only-access-for-auditors); [alerts](alerts.md) to Slack, Microsoft Teams and e-mail and anomaly detection for exports, deletions, mass changes, failed logins, off-hours changes and new IPs |
| `@weber-development/logarithm-server` | [Admin server](server.md): a finished admin view with search and export for your customers' admins, event ingest over HTTP and anomaly alerts, as a Docker image or with Node.js |

The first three wrap the store you already use, so adding them changes one line:

```ts
import { withIntegrity } from "@weber-development/logarithm-integrity"
import { datadogSink, withForwarding } from "@weber-development/logarithm-export"

const store = withForwarding(
  withIntegrity(postgresStore({ client: pool }), { key: process.env.AUDIT_KEY! }),
  [datadogSink({ apiKey: process.env.DD_API_KEY! })],
)
export const audit = createAuditLog({ store })
```

## Licence and delivery

Logarithm Pro is licensed per person who works with it. Your customers and the apps you ship need no licence of their own. The packages come from a private GitHub Packages registry; after cancelling, every version you received keeps working, only updates and repository access end. No licence key, no phone-home.

## Upgrading to 2.0

Pro 2.0 follows the schema v2 of the free packages (`outcome`, `correlationId`). Update `@sweberdev/logarithm` to 2.x, run your `migrate*` function, then update the Pro packages. Existing hash chains keep verifying. See [Migrating to 2.0](../migrating-to-2.md).
