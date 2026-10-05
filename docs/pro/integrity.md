---
title: Tamper evidence
description: An HMAC hash chain per tenant and a verifier.
---

An audit log is only useful as evidence if nobody can quietly change it. A database admin, a leaked credential or a bug could update or delete rows. `withIntegrity` makes that visible.

```ts
import { verifyIntegrity, withIntegrity } from "@weber-development/logarithm-integrity"

const store = withIntegrity(postgresStore({ client: pool }), { key: process.env.AUDIT_KEY! })
export const audit = createAuditLog({ store })
```

Every new event gets `metadata.$chain` with its position (`seq`), the hash of the previous event of the same tenant (`prev`) and its own HMAC-SHA256 hash over all fields. Changing any field, deleting an event in the middle or reordering events breaks the chain.

## Verify

```ts
const report = await verifyIntegrity(store, { key: process.env.AUDIT_KEY!, tenantId: "acme" })
// { ok: true, checked: 18234, erased: 3, oldestSeq: 1, head: "9f2c…", issues: [] }
```

Each issue names the event, its position and the reason: `hash-mismatch` (changed), `broken-link` (removed, inserted or reordered), `actor-mismatch` (actor changed without an erasure) or `missing-link`. Run it nightly and alert on `ok: false`.

## The key

Use at least 32 random bytes (`openssl rand -base64 48`) and keep the key outside the database, e.g. in your secret manager. Someone with both the key and write access could rebuild the chain. To also detect a rewritten tail, store `report.head` somewhere else each day, e.g. in a separate bucket, and compare.

## Works with retention and erasure

- Deleting the oldest events with retention is fine: the chain then starts at a later `seq`, reported as `oldestSeq`.
- An erased actor (see [Retention and privacy](retention.md)) still verifies, because the hash covers an HMAC of the actor, not the actor itself. The report counts these as `erased`.

## Limits

The chain head is kept in memory, so write each tenant's events through one process or one queue. If you run several app servers, send audit writes through a single worker, or verify per tenant and accept that concurrent writers produce `broken-link` issues. Events recorded with an `occurredAt` older than the chain head are moved to the head; the original time is kept in `$chain.reportedAt`.
