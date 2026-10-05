---
title: Tenants and access
description: Keep each customer's log separate.
---

In a B2B SaaS app every event belongs to a customer organisation: the tenant.

- Set `tenantId` on every event, best via `audit.with({ tenantId })` once per request.
- A log created with `with({ tenantId })` adds that tenant to every query and refuses `get()` for events of other tenants. A query cannot widen it.
- `createAuditHandler` takes the tenant from your `authorize` function, never from the request.
- Events without a tenant (`tenantId: null`) are for your own operations, e.g. `system.deployed`. Query them with `tenantId: null`.

## Who may see the log

Typically only admins and owners of an organisation. Decide in `authorize`; returning `null` answers 403.

Consider showing your own staff's actions in a customer's log too, e.g. "Support (Weber Development) signed in as Anna". Customers trust a log more when it includes the vendor.
