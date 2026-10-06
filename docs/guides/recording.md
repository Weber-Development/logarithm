---
title: Recording events
description: Actions, actors, targets, diffs and what to log.
---

An event answers four questions: **who** (actor) did **what** (action) to **which object** (targets) and **what changed** (changes).

```ts
await audit.record({
  action: "member.role_changed",
  actor: { id: user.id, name: user.name, email: user.email },
  targets: [{ type: "member", id: member.id, name: member.email }],
  before: { role: "viewer" },
  after: { role: "admin" },
  context: { ip: request.headers.get("x-forwarded-for") ?? undefined },
  metadata: { reason: "Requested by support ticket 4711" },
})
```

## Actions

Name actions `resource.verb` in the past tense: `project.created`, `invoice.paid`, `api_key.rotated`, `user.signed_in`. Letters, digits, `_` and `-`, separated by dots. Filters accept a prefix such as `project.*`.

## Typed actions

Give `createAuditLog` an action catalog and the compiler checks every action name, every `action` filter and the metadata of each action. The catalog is a type only: nothing changes at runtime, and logs without one accept any action as before.

```ts
type Actions = {
  "project.created": {}
  "project.updated": { reason?: string }
  "invoice.paid": { amount: number; currency: "CHF" | "EUR" }
  "member.role_changed": { role: "admin" | "member" }
}

export const audit = createAuditLog<Actions>({ store })

await audit.record({ action: "invoice.paid", actor, metadata: { amount: 120, currency: "CHF" } })
await audit.record({ action: "invoice.payed", actor })    // error: unknown action
await audit.record({ action: "invoice.paid", actor })     // error: metadata is required
await audit.query({ action: "member.*" })                 // ok: prefix of known actions
await audit.count({ action: "billing.*", groupBy: "day" }) // error: no such prefix
```

Metadata is optional for actions whose type has no required fields. `audit.with()` keeps the catalog, and returned events have `action` typed as the union of catalog names.

## Actors

`actor.id` is required. `type` defaults to `user`; use `api_key`, `system` or `job` for everything else, so the viewer can tell people and automation apart.

## Changes

Pass `before` and `after` and Logarithm computes the diff:

- Nested objects become dot paths such as `billing.plan`.
- Arrays are compared as a whole.
- Dates are stored as ISO strings.
- Fields named `password`, `token`, `secret`, `apiKey`, `iban`, `cardNumber` and similar are stored as `[redacted]`, also inside nested objects and in `metadata`. Change the list with the `redact` option.

Skip noisy fields with `ignore`:

```ts
createAuditLog({ store, ignore: ["updatedAt", "version"], redact: [...DEFAULT_REDACT, "taxId"] })
```

You can also pass `changes` yourself instead of `before` and `after`.

## Defaults per request

`audit.with()` returns a log that fills in tenant, actor and context for every event. Create it once per request, e.g. in middleware:

```ts
const log = audit.with({
  tenantId: session.orgId,
  actor: { id: session.userId, name: session.name },
  context: contextFromRequest(request),
})
await log.record({ action: "project.archived", targets: [{ type: "project", id }] })
```

`contextFromRequest(request)` reads the client IP, browser, request id and, on Vercel or Cloudflare, the city and country from the usual proxy headers. It also accepts a `Headers` object, e.g. `await headers()` in a Next.js server action. The IP comes from `x-forwarded-for` and similar headers, which clients can forge unless a proxy sets them. Without such a proxy, pass `{ trustProxy: false }`.

## What to log

Log what a customer's admin or an auditor would ask about: sign-ins and failed sign-ins, membership and role changes, permission and security settings, API keys, billing changes, exports and deletions. Do not log every page view; the audit log is not your analytics.

Record the event in the same code path as the change. With Postgres you can pass a transaction client to `postgresStore` so the event is only stored if the change commits.
