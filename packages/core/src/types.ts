/** Who performed an action: a user, an API key, a background job or the system itself. */
export interface AuditActor {
  id: string;
  /** For example `user`, `api_key`, `system`. Defaults to `user`. */
  type?: string;
  name?: string;
  email?: string;
}

/** What an action was performed on. */
export interface AuditTarget {
  id: string;
  /** For example `project`, `invoice`, `member`. */
  type: string;
  name?: string;
}

/** One changed field. `field` is a dot path such as `billing.plan`. */
export interface AuditChange {
  field: string;
  before?: unknown;
  after?: unknown;
}

/** Where the request came from. */
export interface AuditContext {
  ip?: string;
  userAgent?: string;
  requestId?: string;
  location?: string;
}

/** A stored audit event. Events are immutable once recorded. */
export interface AuditEvent {
  /** Time-sortable unique id (ULID). */
  id: string;
  /** ISO 8601 timestamp in UTC with milliseconds, e.g. `2026-10-05T10:31:00.000Z`. */
  occurredAt: string;
  /** The customer organisation (tenant) the event belongs to, or `null` for single-tenant apps. */
  tenantId: string | null;
  /** What happened, as `resource.verb`, e.g. `project.updated` or `member.invited`. */
  action: string;
  actor: AuditActor;
  targets: AuditTarget[];
  changes: AuditChange[];
  context: AuditContext;
  metadata: Record<string, unknown>;
}

/** What you pass to `record()`. */
export interface AuditEventInput {
  action: string;
  actor: AuditActor;
  targets?: AuditTarget[];
  /** Explicit changes. Use either this or `before` and `after`. */
  changes?: AuditChange[];
  /** Object state before the change; Logarithm computes the changes from `before` and `after`. */
  before?: unknown;
  after?: unknown;
  context?: AuditContext;
  metadata?: Record<string, unknown>;
  tenantId?: string | null;
  /** Defaults to now. */
  occurredAt?: Date | string;
}

/** Filters for `query()`. All filters are combined with AND. */
export interface AuditQuery {
  /** Only events of this tenant. `null` matches events without a tenant. Omit for all tenants. */
  tenantId?: string | null;
  actorId?: string;
  /** Exact action, or a prefix ending in `.*` such as `project.*`. Several values are combined with OR. */
  action?: string | string[];
  targetId?: string;
  targetType?: string;
  /** Inclusive lower bound. */
  from?: Date | string;
  /** Exclusive upper bound. */
  to?: Date | string;
  /** Case-insensitive text search in action, actor and target ids, names and emails. */
  search?: string;
  /** Page size, 1 to 500. Default 50. */
  limit?: number;
  /** `nextCursor` of the previous page. */
  cursor?: string | null;
}

export interface AuditPage {
  /** Newest first. */
  events: AuditEvent[];
  /** Pass as `cursor` to get the next (older) page; `null` on the last page. */
  nextCursor: string | null;
}

/** A query after validation, as the stores receive it. */
export interface StoreQuery {
  tenantId?: string | null;
  actorId?: string;
  /** Exact actions. */
  actions?: string[];
  /** Action prefixes including the trailing dot, e.g. `project.`. */
  actionPrefixes?: string[];
  targetId?: string;
  targetType?: string;
  /** ISO strings. */
  from?: string;
  to?: string;
  /** Lower-cased search text. */
  search?: string;
  /** Only events older than this position (keyset pagination). */
  before?: { occurredAt: string; id: string };
  /** Number of events to return. */
  limit: number;
}

/**
 * Persistence for audit events. Implement this to use another database.
 * `query` must return events ordered by `occurredAt` descending, then `id` descending.
 */
export interface AuditStore {
  insert(events: AuditEvent[]): Promise<void>;
  query(query: StoreQuery): Promise<AuditEvent[]>;
  get(id: string): Promise<AuditEvent | null>;
  /** Deletes events older than `before`; returns the number deleted. Used for retention. */
  deleteBefore?(before: string, tenantId?: string | null): Promise<number>;
  /** Replaces the stored actor of every event by `actorId`; returns the number changed. Used for erasure requests. */
  rewriteActor?(actorId: string, actor: AuditActor): Promise<number>;
}
