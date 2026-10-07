---
title: Other frameworks
description: Hono, Remix and React Router, Express and Cloudflare Workers.
---

The viewer needs one thing from your server: a `GET` endpoint that returns the tenant's events after your own access check. `createAuditHandler` speaks the Fetch API, so wherever you get a `Request` and return a `Response`, it is one line. For frameworks that do not, call `audit.query` yourself.

## Hono

```ts
import { Hono } from "hono"
import { contextFromRequest, createAuditHandler } from "@sweberdev/logarithm"
import { audit } from "./audit"

const app = new Hono()

const handler = createAuditHandler({
  log: audit,
  async authorize(request) {
    const session = await sessionFrom(request)
    return session?.role === "admin" ? { tenantId: session.orgId } : null
  },
})

app.get("/api/audit", (c) => handler(c.req.raw))
```

Record events in your route handlers with a log scoped to the request:

```ts
app.post("/api/projects/:id/archive", async (c) => {
  const session = await requireSession(c.req.raw)
  const log = audit.with({
    tenantId: session.orgId,
    actor: { id: session.userId, name: session.name },
    context: contextFromRequest(c.req.raw),
  })
  await archiveProject(c.req.param("id"))
  await log.record({ action: "project.archived", targets: [{ type: "project", id: c.req.param("id") }] })
  return c.json({ ok: true })
})
```

## Remix and React Router

A resource route returns the handler's response:

```ts
// app/routes/api.audit.ts
import type { LoaderFunctionArgs } from "react-router"
import { audit, auditHandler } from "~/audit.server"

export const loader = ({ request }: LoaderFunctionArgs) => auditHandler(request)
```

Record in an `action`, next to the change:

```ts
export async function action({ request, params }: ActionFunctionArgs) {
  const session = await requireAdmin(request)
  const log = audit.with({ tenantId: session.orgId, actor: { id: session.userId } })
  const before = await getProject(params.id)
  const after = await updateProject(params.id, await request.formData())
  await log.record({ action: "project.updated", targets: [{ type: "project", id: after.id }], before, after })
  return redirect("/settings")
}
```

## Express and Fastify

These pass Node request objects, not Fetch requests. Build the query with `parseQueryParams` and ask the scoped log:

```ts
import express from "express"
import { AuditQueryError, parseQueryParams } from "@sweberdev/logarithm"

const app = express()

app.get("/api/audit", async (req, res) => {
  const session = await requireAdmin(req, res) // sends 403 itself and returns null
  if (!session) return
  try {
    const params = new URL(req.originalUrl, "http://localhost").searchParams
    const page = await audit.with({ tenantId: session.orgId }).query(parseQueryParams(params))
    res.set("cache-control", "no-store").json(page)
  } catch (error) {
    if (error instanceof AuditQueryError) return res.status(400).json({ error: error.message })
    throw error
  }
})
```

The scoped log (`with({ tenantId })`) adds the tenant to every query, so the URL cannot reach another customer. Fastify works the same with `request.url` and `reply.send`.

## Cloudflare Workers and edge runtimes

`createAuditHandler` and the core package use only Web APIs. Use a store whose driver runs on the edge, for example `postgresStore` with `@neondatabase/serverless` or Cloudflare Hyperdrive, see [Postgres](postgres.md). SQLite through `node:sqlite` or `better-sqlite3` does not run on Workers.
