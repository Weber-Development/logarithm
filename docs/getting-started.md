---
title: Getting started
description: Install Logarithm, create the table and record your first event.
---

1. Install the packages:

   ```sh
   pnpm add @sweberdev/logarithm @sweberdev/logarithm-react
   ```

   With npm: `npm i @sweberdev/logarithm @sweberdev/logarithm-react`. You also need a database driver you probably already have, e.g. `pg`.

2. Create the audit log once, next to your database client:

   ```ts
   // lib/audit.ts
   import { createAuditLog } from "@sweberdev/logarithm"
   import { migratePostgres, postgresStore } from "@sweberdev/logarithm/postgres"
   import { pool } from "./db"

   await migratePostgres({ client: pool }) // or copy postgresSchema() into your migrations
   export const audit = createAuditLog({ store: postgresStore({ client: pool }) })
   ```

3. Record an event where something changes:

   ```ts
   await audit.record({
     tenantId: org.id,
     action: "project.updated",
     actor: { id: user.id, name: user.name, email: user.email },
     targets: [{ type: "project", id: project.id, name: project.name }],
     before: project,
     after: updated,
   })
   ```

4. Add an endpoint and the view. See [Next.js](guides/nextjs.md) and [React viewer](guides/react.md).

## Requirements

- Node.js 20 or newer, or Bun, Deno, Cloudflare Workers (the core uses only Web APIs)
- Postgres 13 or newer, or SQLite 3.38 or newer
- React 18 or newer for the viewer
