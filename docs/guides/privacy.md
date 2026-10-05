---
title: Privacy
description: Personal data in audit logs, GDPR and the Swiss FADP.
---

An audit log contains personal data: names, email addresses, IP addresses. That is usually fine because you have a legitimate interest in security and traceability, but it comes with duties.

**What Logarithm does**

- stores everything in your own database; no data goes to a third party,
- never stores values of fields such as passwords, tokens or card numbers (`[redacted]`),
- stores only the context you pass; IP address and user agent are optional.

**What you decide**

- **Retention.** Keep events only as long as you need them, e.g. 13 months, and say so in your privacy notice. Delete older events with `store.deleteBefore()` from a daily job, or use [Logarithm Pro](pro/retention.md) for periods per customer and archiving.
- **Erasure and access requests.** When a person asks for erasure or access, you have to find their events. `store.rewriteActor()` replaces an actor, and Logarithm Pro does both requests in one call, with a stable pseudonym that keeps the log usable.
- **Minimisation.** Pass `ignore` and `redact` for fields you do not need, e.g. free-text notes.

This page is not legal advice. Clarify retention periods and your privacy notice with a qualified person.
