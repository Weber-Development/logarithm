---
title: Writing without JavaScript
description: Write audit events from Python, PHP, Go or plain SQL into the table Logarithm reads.
---

The audit table is a plain Postgres table with a fixed shape, so a service in any language can insert events with SQL while a Node app reads them with `createAuditLog` and shows them in `<AuditLog>`. Nothing in the table is specific to JavaScript.

The layout described here is **schema version 2**, created by Logarithm 2.0 and later and recorded in `<table>_meta`. Print the exact SQL with `postgresSchema()` ([Migrations](migrations.md)); the column list is also in [Postgres](postgres.md).

## What the writer has to do

`record()` does five things before it inserts a row. A writer that skips `record()` takes them over:

| `record()` | Direct write |
|---|---|
| Validates the event | `action` matches `^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$` (at most 200 characters), `actor.id` is not empty, every target has `id` and `type`, `outcome` is `success`, `failure` or `denied`, `correlationId` is 1 to 190 characters. |
| Creates the `id` | A [ULID](https://github.com/ulid/spec): 26 uppercase Crockford base32 characters, 48 bits of milliseconds plus 80 random bits. Pagination sorts by `(occurred_at, id)`. |
| Stores the time | `occurred_at` as `timestamptz`, UTC, **rounded down to whole milliseconds**. Postgres keeps microseconds, but the paging cursor carries only milliseconds: rows that differ by less than a millisecond at a page boundary are skipped. Python's `datetime.now()` has microseconds, so cut them off. |
| Fills `actor_id` and `search` | `actor_id` is a copy of `actor.id`. `search` is lower-case text joined by spaces: the action, `actor.id`, `actor.name`, `actor.email`, then `type`, `id` and `name` of every target (empty values left out). Without it the search box does not find the event. |
| Redacts secrets | **Not done.** `record()` replaces fields such as `password` or `token` with `[redacted]` in `changes` and `metadata`. A direct writer must keep secrets and personal data out of those columns itself. |

Set `actor.type` (default `user`; `api_key`, `system` or `job` for automation) and `outcome` (`success` unless it failed or was refused) on every event. A row without an `outcome` counts as `success` in filters, but new events should carry one.

## Time

The cursor that `query()` returns is `occurredAt` (ISO 8601, milliseconds) and `id`. If a stored `occurred_at` has microseconds, a page that ends inside such a millisecond continues after the rounded value and skips the remaining rows of that millisecond. Always write whole milliseconds, as the example does.

## Python example

```python
import json, os, time
from datetime import datetime, timezone
import psycopg

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

def ulid(ms: int) -> str:
    value = (ms << 80) | int.from_bytes(os.urandom(10), "big")
    return "".join(ALPHABET[(value >> (5 * i)) & 31] for i in range(25, -1, -1))

def record(conn, *, tenant_id, action, actor_id, target_id, target_type, outcome="success"):
    ms = int(time.time() * 1000)  # whole milliseconds, see "Time" below
    actor = {"id": actor_id, "type": "user"}
    targets = [{"id": target_id, "type": target_type}]
    search = " ".join([action, actor_id, target_type, target_id]).lower()
    conn.execute(
        """INSERT INTO audit_events
             (id, occurred_at, tenant_id, action, actor_id, actor, targets, outcome, search)
           VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, %s)""",
        (ulid(ms), datetime.fromtimestamp(ms / 1000, timezone.utc), tenant_id, action, actor_id,
         json.dumps(actor), json.dumps(targets), outcome, search),
    )

with psycopg.connect(dsn) as conn:
    record(conn, tenant_id="org_42", action="document.read", actor_id="user_7",
           target_id="doc_9", target_type="document")
```

The columns `changes`, `context` and `metadata` default to `[]`, `{}` and `{}`. Fill them as described in [Recording events](recording.md): `changes` is a list of `{ "field", "before"?, "after"? }`, `context` takes `ip`, `userAgent`, `requestId` and `location`, `metadata` is any JSON object.

Read the same table from Node:

```ts
const audit = createAuditLog({ store: postgresStore({ client: pool }) })
const { events } = await audit.with({ tenantId: "org_42" }).query({ action: "document.*" })
```

## Check the version at startup

```python
row = conn.execute("SELECT value FROM audit_events_meta WHERE name = 'schema_version'").fetchone()
assert row and row[0] == "2", f"unexpected Logarithm schema version {row}"
```

When a future release changes the layout, the release notes say so and `schema_version` changes. A writer that checks it stops instead of writing rows in the old layout. Give the writing role only `INSERT` (and `SELECT` if it reads), and the reading role only `SELECT`.

## Partitioned tables

For very high volumes create the table with `postgresSchema({ partitioned: true })`, see [Partitioning](partitioning.md). A non-JavaScript writer inserts in exactly the same way. Create next month's partition before the month starts, with the names and UTC bounds that `ensurePartitions` uses:

```sql
CREATE TABLE IF NOT EXISTS "audit_events_p2026_12" PARTITION OF "audit_events"
  FOR VALUES FROM ('2026-12-01T00:00:00.000Z') TO ('2027-01-01T00:00:00.000Z');
```

Events that fit no partition land in the default partition, so none is lost, but Postgres refuses to create a partition for a range in which the default partition already holds rows.

## Logarithm Pro

The hash chain of [Logarithm Pro](../pro/integrity.md) is stored in `metadata.$chain` and has to be computed per tenant in order. Rows written without it are reported by the verifier as `missing-link`. If you plan to add Pro, write through the Pro package or reproduce its chain in your writer.
