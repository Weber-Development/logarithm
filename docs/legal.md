---
title: Legal notes
description: What Logarithm does and does not do from a legal perspective.
---

Logarithm is a library for recording and showing audit events. It is **not legal advice**, and using it does not make your service compliant with the GDPR, the Swiss FADP, ISO 27001, SOC 2 or any other law or standard.

**Logarithm does**

- store the events your code records, in your database,
- redact values of fields with sensitive names,
- restrict queries to one tenant when you scope the log.

**Logarithm does not**

- decide which events you must record or how long you must keep them,
- make stored events tamper-proof on its own (see [Logarithm Pro](pro/integrity.md)),
- replace backups, access control on your database or a privacy notice.

**You decide** what to record, who may read it, how long it is kept and what your privacy notice says. Have these questions reviewed by a qualified person.
