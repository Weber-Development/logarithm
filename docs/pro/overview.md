---
title: Logarithm Pro
description: Tamper evidence, retention and privacy requests, export, forwarding and alerts.
---

The free packages record and show events. Logarithm Pro adds what enterprise customers, auditors and data protection officers ask for next.

| Package | What it adds |
|---|---|
| `@weber-development/logarithm-integrity` | [Tamper evidence](integrity.md): every event is linked to the previous one with an HMAC hash chain; a verifier shows which event was changed, removed or reordered |
| `@weber-development/logarithm-retention` | [Retention and privacy](retention.md): retention periods per customer with archiving, GDPR and Swiss FADP erasure with a stable pseudonym, access-request export |
| `@weber-development/logarithm-export` | [Export and forwarding](export.md): streamed CSV, NDJSON and JSON downloads for your customers, delivery to signed webhooks, Splunk and Datadog; [alerts](alerts.md) to Slack and Microsoft Teams and anomaly detection for exports, deletions and failed logins |

All three wrap the store you already use, so adding them changes one line:

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
