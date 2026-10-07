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

Each issue names the event, its position and the reason: `hash-mismatch` (changed), `broken-link` (removed, inserted or reordered), `actor-mismatch` (actor changed without an erasure) or `missing-link`. With checkpoints (below) also `truncated`, `checkpoint-mismatch` and `checkpoint-invalid`. Run it nightly and alert on `ok: false`.

## The key

Use at least 32 random bytes (`openssl rand -base64 48`) and keep the key outside the database, e.g. in your secret manager. Someone with both the key and write access could rebuild the chain.

## Checkpoints

The chain alone cannot tell whether someone deleted the newest events, or rebuilt the whole chain with the key. A checkpoint is a signed snapshot of the chain head that you keep outside the database. Take one daily and send it somewhere the database cannot reach:

```ts
import { createCheckpoint, verifyIntegrity } from "@weber-development/logarithm-integrity"

const checkpoint = await createCheckpoint(store, { key, tenantId: "acme" })
await bucket.put(`audit-checkpoints/acme/${checkpoint.createdAt}.json`, JSON.stringify(checkpoint))

// later
const report = await verifyIntegrity(store, { key, tenantId: "acme", checkpoints: await loadCheckpoints("acme") })
```

`truncated` means the chain now ends before a checkpoint, so the newest events were removed. `checkpoint-mismatch` means the event at a checkpoint has a different hash, so the chain was rebuilt. `checkpoint-invalid` means the checkpoint's signature does not match the key. Checkpoints older than the oldest remaining event (deleted by retention) are skipped. `report.checkpoints` counts the ones that matched.

## Trusted timestamps

A checkpoint proves the chain head, but not *when* you took it: whoever holds the key could backdate one. A time-stamping authority (RFC 3161) closes that gap. It certifies that the checkpoint existed at a point in time, and sees only a SHA-256 digest, never your data.

```ts
import { createCheckpoint, timestampCheckpoint, verifyTimestamp } from "@weber-development/logarithm-integrity"

const checkpoint = await createCheckpoint(store, { key, tenantId: "acme" })
const stamped = await timestampCheckpoint(checkpoint!, { tsa: "https://freetsa.org/tsr" })
// { checkpoint, token: "<base64 DER>", genTime: "2026-10-06T12:00:00Z", tsa: "https://freetsa.org/tsr" }
await bucket.put(`audit-checkpoints/acme/${checkpoint!.createdAt}.json`, JSON.stringify(stamped))

await verifyTimestamp(stamped) // "2026-10-06T12:00:00Z", or null if the token belongs to another checkpoint
```

For regulated customers use a qualified authority. In Switzerland and the EU, qualified providers are listed in the national trusted lists, and their URL goes into `tsa`.

`verifyTimestamp()` checks that the token covers the checkpoint and returns the certified time. It does not check the authority's signature. For the full check, give `verifyTimestampChain()` the authority's root certificate (PEM or base64 DER), which you get from the authority and keep yourself:

```ts
import { verifyTimestampChain } from "@weber-development/logarithm-integrity"

const proof = await verifyTimestampChain(stamped, { trustedRoots: [authorityRootPem] })
// { genTime: "2026-10-06T12:00:00Z", signer: "CN=Example TSA, O=Example", chain: [...] }
```

It checks that the token covers the checkpoint, that the signature is valid, that the signer's certificate is meant for time-stamping, that the chain leads to one of your roots, and that every certificate was valid at the certified time. It throws with the reason when something does not hold. RSA and ECDSA (P-256, P-384, P-521) with SHA-2 are supported. Revocation is not checked: if an authority reports a compromised key, remove its root from `trustedRoots`. `verifyTimestampToken(token, digest, { trustedRoots })` does the same for a raw token and digest. The `openssl ts -verify` route stays valid for checking outside your code: save the `token` (base64-decode it to a `.tsr` token file) and run `openssl ts -verify -token_in -in token.tsr -digest <sha256 hex of the checkpoint> -CAfile authority-ca.pem`.

## Works with retention and erasure

- Deleting the oldest events with retention is fine: the chain then starts at a later `seq`, reported as `oldestSeq`.
- An erased actor (see [Retention and privacy](retention.md)) still verifies, because the hash covers an HMAC of the actor, not the actor itself. The report counts these as `erased`.

## Limits

The chain head is kept in memory, so write each tenant's events through one process or one queue. If you run several app servers, send audit writes through a single worker, or verify per tenant and accept that concurrent writers produce `broken-link` issues. Events recorded with an `occurredAt` older than the chain head are moved to the head; the original time is kept in `$chain.reportedAt`.
