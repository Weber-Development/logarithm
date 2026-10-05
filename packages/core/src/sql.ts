import { searchText } from "./query";
import type { AuditEvent, StoreQuery } from "./types";

/** Table and schema names are interpolated into SQL, so only plain identifiers are accepted. */
export function identifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name)) {
    throw new Error(`Invalid SQL identifier "${name}"`);
  }
  return `"${name}"`;
}

export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface Row {
  id: string;
  occurred_at: string | Date;
  tenant_id: string | null;
  action: string;
  actor_id: string;
  actor: unknown;
  targets: unknown;
  changes: unknown;
  context: unknown;
  metadata: unknown;
}

export function toRow(event: AuditEvent) {
  return {
    id: event.id,
    occurred_at: event.occurredAt,
    tenant_id: event.tenantId,
    action: event.action,
    actor_id: event.actor.id,
    actor: JSON.stringify(event.actor),
    targets: JSON.stringify(event.targets),
    changes: JSON.stringify(event.changes),
    context: JSON.stringify(event.context),
    metadata: JSON.stringify(event.metadata),
    search: searchText(event),
  };
}

const parse = <T>(value: unknown): T =>
  (typeof value === "string" ? JSON.parse(value) : value) as T;

export function fromRow(row: Row): AuditEvent {
  const occurredAt =
    row.occurred_at instanceof Date
      ? row.occurred_at.toISOString()
      : new Date(row.occurred_at).toISOString();
  return {
    id: row.id,
    occurredAt,
    tenantId: row.tenant_id ?? null,
    action: row.action,
    actor: parse(row.actor),
    targets: parse(row.targets),
    changes: parse(row.changes),
    context: parse(row.context),
    metadata: parse(row.metadata),
  };
}

export interface WhereDialect {
  /** Placeholder for the n-th (1-based) parameter. */
  param(n: number): string;
  /** SQL that is true when the targets column contains a target with the given field value. */
  targetHas(field: "id" | "type", param: string): string;
  /** Wraps a timestamp parameter. */
  time(param: string): string;
}

/** Builds the WHERE clause shared by the SQL stores. */
export function buildWhere(q: StoreQuery, d: WhereDialect): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const p = (value: unknown) => {
    params.push(value);
    return d.param(params.length);
  };
  if (q.tenantId === null) clauses.push("tenant_id IS NULL");
  else if (q.tenantId !== undefined) clauses.push(`tenant_id = ${p(q.tenantId)}`);
  if (q.actorId) clauses.push(`actor_id = ${p(q.actorId)}`);
  if (q.actions || q.actionPrefixes) {
    const any = [
      ...(q.actions ?? []).map((a) => `action = ${p(a)}`),
      ...(q.actionPrefixes ?? []).map((a) => `action LIKE ${p(`${escapeLike(a)}%`)} ESCAPE '\\'`),
    ];
    clauses.push(`(${any.join(" OR ")})`);
  }
  if (q.targetId) clauses.push(d.targetHas("id", p(q.targetId)));
  if (q.targetType) clauses.push(d.targetHas("type", p(q.targetType)));
  if (q.from) clauses.push(`occurred_at >= ${d.time(p(q.from))}`);
  if (q.to) clauses.push(`occurred_at < ${d.time(p(q.to))}`);
  if (q.search) clauses.push(`search LIKE ${p(`%${escapeLike(q.search)}%`)} ESCAPE '\\'`);
  if (q.before) {
    const at = d.time(p(q.before.occurredAt));
    const at2 = d.time(p(q.before.occurredAt));
    clauses.push(`(occurred_at < ${at} OR (occurred_at = ${at2} AND id < ${p(q.before.id)}))`);
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}
