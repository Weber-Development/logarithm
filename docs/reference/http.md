---
title: HTTP endpoint
description: Parameters and responses of createAuditHandler.
---

`GET` only. Other methods answer `405`.

| Parameter | Maps to |
|---|---|
| `actor` | `actorId` |
| `action` | `action`; comma-separated or repeated, `prefix.*` allowed |
| `target` | `targetId` |
| `targetType` | `targetType` |
| `from`, `to` | Time range, ISO 8601 |
| `q` | `search` |
| `limit` | Page size, at most 500 |
| `cursor` | Next page |
| `id` | Return one event instead of a page |

Responses:

| Status | Body |
|---|---|
| `200` | `{ "events": AuditEvent[], "nextCursor": string \| null }` or one `AuditEvent` |
| `400` | `{ "error": "..." }` for invalid dates, limits or cursors |
| `403` | `authorize` returned `null` |
| `404` | Event not found in the caller's tenant |

Responses carry `cache-control: no-store`.
