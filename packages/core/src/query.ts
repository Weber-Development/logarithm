import type { AuditEvent, AuditQuery, StoreQuery } from "./types";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

export class AuditQueryError extends Error {
  override name = "AuditQueryError";
}

/** Converts a date to the stored format: ISO 8601, UTC, milliseconds. */
export function toIso(value: Date | string, name = "date"): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new AuditQueryError(`Invalid ${name}: ${String(value)}`);
  return date.toISOString();
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function encodeCursor(event: Pick<AuditEvent, "occurredAt" | "id">): string {
  return toBase64Url(`${event.occurredAt}|${event.id}`);
}

export function decodeCursor(cursor: string): { occurredAt: string; id: string } {
  let text: string;
  try {
    text = fromBase64Url(cursor);
  } catch {
    throw new AuditQueryError("Invalid cursor");
  }
  const [occurredAt, id, ...rest] = text.split("|");
  if (!occurredAt || !id || rest.length > 0 || Number.isNaN(Date.parse(occurredAt))) {
    throw new AuditQueryError("Invalid cursor");
  }
  return { occurredAt, id };
}

/** Validates a public query and turns it into the form the stores receive. */
export function toStoreQuery(query: AuditQuery = {}): StoreQuery {
  const limit = query.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new AuditQueryError(`limit must be an integer from 1 to ${MAX_LIMIT}`);
  }
  const out: StoreQuery = { limit };
  if (query.tenantId !== undefined) out.tenantId = query.tenantId;
  if (query.actorId) out.actorId = query.actorId;
  if (query.targetId) out.targetId = query.targetId;
  if (query.targetType) out.targetType = query.targetType;
  if (query.from !== undefined) out.from = toIso(query.from, "from");
  if (query.to !== undefined) out.to = toIso(query.to, "to");
  const search = query.search?.trim().toLowerCase();
  if (search) out.search = search;
  const actions = (Array.isArray(query.action) ? query.action : query.action ? [query.action] : [])
    .map((a) => a.trim())
    .filter(Boolean);
  for (const action of actions) {
    if (action === "*") continue;
    if (action.endsWith(".*")) {
      out.actionPrefixes = [...(out.actionPrefixes ?? []), action.slice(0, -1)];
    } else {
      out.actions = [...(out.actions ?? []), action];
    }
  }
  if (query.cursor) out.before = decodeCursor(query.cursor);
  return out;
}

/** The text that `search` matches against. Stores that index it save this alongside the event. */
export function searchText(event: AuditEvent): string {
  const parts = [event.action, event.actor.id, event.actor.name, event.actor.email];
  for (const t of event.targets) parts.push(t.type, t.id, t.name);
  return parts
    .filter((p): p is string => typeof p === "string" && p.length > 0)
    .join(" ")
    .toLowerCase();
}

/** Reference implementation of the query semantics, used by the memory store and the tests. */
export function matches(event: AuditEvent, q: StoreQuery): boolean {
  if (q.tenantId !== undefined && event.tenantId !== q.tenantId) return false;
  if (q.actorId && event.actor.id !== q.actorId) return false;
  if (q.actions || q.actionPrefixes) {
    const exact = q.actions?.includes(event.action) ?? false;
    const prefix = q.actionPrefixes?.some((p) => event.action.startsWith(p)) ?? false;
    if (!exact && !prefix) return false;
  }
  if (q.targetId && !event.targets.some((t) => t.id === q.targetId)) return false;
  if (q.targetType && !event.targets.some((t) => t.type === q.targetType)) return false;
  if (q.from && event.occurredAt < q.from) return false;
  if (q.to && event.occurredAt >= q.to) return false;
  if (q.search && !searchText(event).includes(q.search)) return false;
  if (q.before) {
    if (event.occurredAt > q.before.occurredAt) return false;
    if (event.occurredAt === q.before.occurredAt && event.id >= q.before.id) return false;
  }
  return true;
}

/** Newest first, then by id descending. */
export function compareEvents(a: AuditEvent, b: AuditEvent): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}
