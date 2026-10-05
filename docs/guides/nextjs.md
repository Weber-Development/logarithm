---
title: Next.js
description: An API route for the viewer with access control.
---

`createAuditHandler` turns a Fetch API `Request` into a `Response`, so it fits Next.js route handlers, Remix loaders, Hono, Bun and Cloudflare Workers.

```ts
// app/api/audit/route.ts
import { createAuditHandler } from "@sweberdev/logarithm"
import { audit } from "@/lib/audit"
import { getSession } from "@/lib/auth"

export const GET = createAuditHandler({
  log: audit,
  async authorize() {
    const session = await getSession()
    if (!session || session.role !== "admin") return null // 403
    return { tenantId: session.orgId }
  },
})
```

`authorize` is the only access check. Return the tenant the caller may see; the handler scopes every query to it, so `?tenant=` or a forged cursor cannot reach other customers.

Then render the view on an admin page:

```tsx
// app/settings/activity/page.tsx
"use client"
import { AuditLog } from "@sweberdev/logarithm-react"
import "@sweberdev/logarithm-react/styles.css"

export default function ActivityPage() {
  return <AuditLog endpoint="/api/audit" locale="de-CH" />
}
```

## Server components

Without an API route, pass a server action as `fetchPage`:

```ts
"use server"
export async function loadActivity(query: AuditQuery) {
  const session = await requireAdmin()
  return audit.with({ tenantId: session.orgId }).query(query)
}
```

```tsx
<AuditLog fetchPage={loadActivity} />
```
