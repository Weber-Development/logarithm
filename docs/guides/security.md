---
title: Security model
description: What Logarithm protects, what it leaves to you, and how to report a problem.
---

An audit log is evidence. This page says what Logarithm guarantees, what depends on your setup, and where its limits are.

## Who can read what

- **Tenant isolation.** A log made with `audit.with({ tenantId })` adds the tenant to every `query`, `count` and `get`. A query cannot widen it, and `get()` returns `null` for an event of another tenant. `createAuditHandler` takes the tenant from your `authorize` function and never from the URL, so a forged `tenant` parameter or cursor reaches nothing.
- **Access control is yours.** Logarithm does not know your users. `authorize` is the only check: return `null` for everyone who may not read the log.
- **Writes are not scoped by the viewer.** The handler is read-only (`GET`). In your own code, `record()` on a scoped log fills in the tenant, but an explicit `tenantId` in the event input wins. Do not build events from untrusted input.

## What gets stored

- **Redaction.** Fields named like secrets (`password`, `token`, `apiKey`, `authorization`, `iban`, `cardNumber` and more, regardless of case and of `_` and `-`) are replaced by `[redacted]` in changes and metadata, also inside nested objects. Extend the list with `redact`. Redaction works on names, so a secret stored under a harmless name is stored as is.
- **Personal data.** Actors carry id, name and email, and `context.ip` can be personal data. Pro's `eraseActor` rewrites an actor to a pseudonym without breaking the integrity chain; see [Retention and privacy](../pro/retention.md) and [Privacy](privacy.md).

## What the database layer does

- **No string building with user input.** Values go through query parameters. The only text interpolated into SQL is the table, schema and database name from your own configuration, and those must be plain identifiers (letters, digits, `_`), or the store throws.
- **Search is escaped.** `search` and prefix filters (`project.*`) escape `%`, `_` and the escape character, so user input cannot turn into a wildcard.
- **No code runs from stored data.** Events are stored and returned as JSON. The React viewer renders them as text, never as HTML.

## Tamper evidence

The free packages do not make a log tamper-proof: someone with write access to the table can change rows. Logarithm Pro adds an HMAC hash chain per tenant that names changed, removed or reordered events, signed checkpoints, and RFC 3161 timestamps that prove the chain head existed on a date, even if your database is later compromised. Keep the HMAC key outside the database. See [Integrity](../pro/integrity.md).

Two limits to know:

- A chain proves that events were not altered after the fact. It does not prove that a recorded event is true, so record at the point of the change, in the same code path.
- Timestamp verification checks a signature and certificate chain, but not revocation. If a time-stamping authority reports a compromised key, remove its root from your trusted roots.

## Dependencies and supply chain

The core package has no runtime dependencies. Releases are published from CI with npm provenance, so you can verify which commit a version was built from (`npm audit signatures`).

## Reporting a vulnerability

Please report security problems privately through the repository's security advisories, see `SECURITY.md`. Do not open a public issue. We acknowledge reports within five working days and aim to fix or mitigate confirmed issues within 30 days. Reporters are credited if they want.
