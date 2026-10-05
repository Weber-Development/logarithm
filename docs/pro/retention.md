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

## Erasure requests

```ts
import { eraseActor } from "@weber-development/logarithm-retention"

const result = await eraseActor(store, "user_123", { key: process.env.AUDIT_KEY! })
// { actor: { id: "erased_3f9a…", type: "erased", name: "Deleted user" }, rewritten: 41, mentionedIn: ["01J…"] }
```

The person's id, name and email are replaced in every event they performed. The pseudonym is derived with an HMAC, so all their events still group together and the log stays readable, without revealing who it was. Events that mention the person as a target are listed in `mentionedIn` for you to review, because those may be needed as evidence.

With [tamper evidence](integrity.md), erased events still verify.

## Access requests

```ts
const data = await exportActorData(store, "user_123", { tenantId: "acme" })
// { performed: AuditEvent[], concerning: AuditEvent[] }
```

`performed` holds what the person did, `concerning` what others did to them. Hand it over as JSON or render it.

These functions help you answer requests under the GDPR (Art. 15, 17) and the Swiss FADP (Art. 25, 32). Whether and how far you must erase or disclose is a legal question; get advice.
