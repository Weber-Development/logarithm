---
title: Why Logarithm
description: What Logarithm does, who it is for and what it deliberately leaves to you.
---

Sooner or later a B2B customer asks: "Can we see who changed what in our account?" Security questionnaires, ISO 27001 and SOC 2 audits ask the same, and so does your own support team when a setting changed and nobody remembers why.

Logarithm is an audit log you run in your own database. You record an event wherever something important happens, and your customers' admins get a ready-made activity view in your app.

- **Record in one line.** `audit.record({ action, actor, targets, before, after })`. Logarithm computes the field-level diff and never stores passwords, tokens or card numbers.
- **Your database.** Stores for Postgres (13+, including Neon and Supabase) and SQLite (`better-sqlite3`, `node:sqlite`, Bun). No external service, no data leaves your infrastructure.
- **Built for multi-tenant SaaS.** Every event belongs to a tenant, and a scoped log cannot read other tenants, even with a crafted query.
- **A view your customers can use.** `<AuditLog>` for React shows entries grouped by day, with search, filters, a diff per entry and paging, in English and German.
- **Fast queries at any size.** Keyset pagination and indexes for tenant, actor, action and target.

## When you need more

[Logarithm Pro](pro/overview.md) adds what auditors and enterprise customers ask for next: tamper evidence with an HMAC hash chain, retention periods with archiving, GDPR and Swiss FADP erasure and access requests, CSV export and forwarding to Splunk, Datadog or a webhook.

## Packages

| Package | License | Content |
|---|---|---|
| `@sweberdev/logarithm` | MIT | `createAuditLog`, diff and redaction, memory, Postgres and SQLite stores, Fetch API handler |
| `@sweberdev/logarithm-react` | MIT | `<AuditLog>` view and `useAuditLog` hook |
| `@weber-development/logarithm-*` | Commercial | [Logarithm Pro](pro/overview.md): integrity, retention and privacy, export and forwarding |
