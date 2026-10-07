---
title: Performance
description: Measured timings with 10 million events, and the index to add when your tenants are large.
---

We load-tested the SQLite store with **10 million events** (200 tenants with 50,000 events each, 5,000 actors, 8 actions, spread over 280 days). The database file is 6.6 GB. The machine was a small cloud VM with 4 vCPUs and 15 GB RAM, Node 22 and `node:sqlite` in WAL mode, with the viewer running in the same process. Postgres and MySQL have the same indexes and the same queries but different engines, so treat the numbers as an order of magnitude and measure your own setup with the script below.

| What the viewer does | median | 95th percentile |
|---|---|---|
| Newest 50 events of a tenant | 0.4 ms | 0.6 ms |
| Next page (cursor) | 0.9 ms | 1.0 ms |
| Last 7 days of a tenant | 0.4 ms | 0.5 ms |
| One tenant, filter by target | 36 ms | 38 ms |
| Events per day of a tenant | 16 ms | 17 ms |
| One tenant, filter by action | 102 ms | 126 ms |
| One tenant, filter by action prefix (`project.*`) | 96 ms | 122 ms |
| One tenant, filter by actor | 123 ms | 131 ms |
| One tenant, text search | 103 ms | 103 ms |
| Events per action of a tenant | 102 ms | 103 ms |

Writing: **about 10,000 events per second** in batches of 1,000 on one connection, while the table grew to 10 million rows. A single `record()` call is one insert and is dominated by your database round trip.

## What this means

- The default view (newest first, per tenant, with a time range or paging) stays in the sub-millisecond range at any size, because every query starts at the `(tenant_id, occurred_at, id)` index.
- Filters on actor, action or text search read through one tenant's events. With 50,000 events per tenant that costs about 100 ms. It grows linearly with the size of a single tenant, not with the size of the table.
- If one tenant can reach millions of events and your admins filter by actor or action a lot, add an index for it in your own migration. Names that start with the table name keep `migrate*` happy:

```sql
-- Postgres
CREATE INDEX CONCURRENTLY audit_events_tenant_actor ON audit_events (tenant_id, actor_id, occurred_at DESC);
CREATE INDEX CONCURRENTLY audit_events_tenant_action ON audit_events (tenant_id, action text_pattern_ops, occurred_at DESC);
```

On MySQL and SQLite create the same columns without `text_pattern_ops`/`DESC`. Each extra index slows writes and uses disk, so add only what your admins actually use. Text search is a substring match over the stored search text; for full-text needs at this scale, forward events to a search system with the [Elasticsearch sink](../pro/export.md) of Logarithm Pro.

## Run it yourself

The script is in the repository (`benchmarks/load.mjs`). Build the core package first, then:

```bash
node benchmarks/load.mjs 1000000 /tmp/logarithm-load.db
```

The first argument is the number of events, the second the database file. Ten million events take about 17 minutes and 7 GB of disk.
