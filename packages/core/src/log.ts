import { createRedactor, DEFAULT_REDACT, diff, redactChanges, scrub } from "./diff";
import { ulid } from "./id";
import { encodeCursor, toIso, toStoreQuery } from "./query";
import type {
  AuditActor,
  AuditContext,
  AuditEvent,
  AuditEventInput,
  AuditPage,
  AuditQuery,
  AuditStore,
} from "./types";

export class AuditValidationError extends Error {
  override name = "AuditValidationError";
}

export interface AuditLogOptions {
  store: AuditStore;
  /** Field names whose values are never stored. Default: passwords, tokens, secrets, card data. */
  redact?: string[];
  /** Fields left out of computed diffs, e.g. `updatedAt`. */
  ignore?: string[];
  /** Defaults applied to every event, e.g. the tenant of the current request. */
  defaults?: AuditDefaults;
  /** Clock, for tests. */
  now?: () => Date;
}

export interface AuditDefaults {
  tenantId?: string | null;
  actor?: AuditActor;
  context?: AuditContext;
  metadata?: Record<string, unknown>;
}

export type AuditRecordInput = Omit<AuditEventInput, "actor"> & { actor?: AuditActor };

export interface AuditLog {
  /** Records one event and returns it as stored. */
  record(input: AuditRecordInput): Promise<AuditEvent>;
  /** Records several events in one write. */
  recordMany(inputs: AuditRecordInput[]): Promise<AuditEvent[]>;
  /** Lists events, newest first, one page at a time. */
  query(query?: AuditQuery): Promise<AuditPage>;
  /** Returns one event or `null`. */
  get(id: string): Promise<AuditEvent | null>;
  /** A log that adds these defaults to every event, e.g. per request: `log.with({ tenantId, actor })`. */
  with(defaults: AuditDefaults): AuditLog;
  readonly store: AuditStore;
}

const ACTION = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;

function validateActor(actor: AuditActor | undefined): AuditActor {
  if (!actor || typeof actor.id !== "string" || actor.id.length === 0) {
    throw new AuditValidationError("actor.id is required");
  }
  const out: AuditActor = { id: actor.id, type: actor.type ?? "user" };
  if (actor.name) out.name = actor.name;
  if (actor.email) out.email = actor.email;
  return out;
}

/**
 * Creates an audit log on top of a store.
 *
 * ```ts
 * const audit = createAuditLog({ store: postgresStore({ client: pool }) })
 * await audit.record({
 *   action: "project.updated",
 *   actor: { id: user.id, name: user.name },
 *   targets: [{ type: "project", id: project.id, name: project.name }],
 *   before, after,
 * })
 * ```
 */
export function createAuditLog(options: AuditLogOptions): AuditLog {
  const { store } = options;
  const redact = options.redact ?? DEFAULT_REDACT;
  const isRedacted = createRedactor(redact);
  const now = options.now ?? (() => new Date());

  const build = (input: AuditRecordInput, defaults: AuditDefaults): AuditEvent => {
    if (
      typeof input.action !== "string" ||
      !ACTION.test(input.action) ||
      input.action.length > 200
    ) {
      throw new AuditValidationError(
        `Invalid action "${String(input.action)}": use letters, digits, _ and -, separated by dots, e.g. "project.updated"`,
      );
    }
    if (input.changes && (input.before !== undefined || input.after !== undefined)) {
      throw new AuditValidationError("Pass either changes or before/after, not both");
    }
    const actor = validateActor(input.actor ?? defaults.actor);
    const targets = (input.targets ?? []).map((t) => {
      if (!t || typeof t.id !== "string" || !t.id || typeof t.type !== "string" || !t.type) {
        throw new AuditValidationError("Every target needs an id and a type");
      }
      const out: AuditEvent["targets"][number] = { id: t.id, type: t.type };
      if (t.name) out.name = t.name;
      return out;
    });
    const changes = input.changes
      ? redactChanges(input.changes, redact)
      : input.before !== undefined || input.after !== undefined
        ? diff(input.before, input.after, { redact, ignore: options.ignore ?? [] })
        : [];
    const metadata = scrub({ ...defaults.metadata, ...input.metadata }, isRedacted) as Record<
      string,
      unknown
    >;
    const occurredAt = toIso(input.occurredAt ?? now(), "occurredAt");
    return {
      id: ulid(),
      occurredAt,
      tenantId: input.tenantId !== undefined ? input.tenantId : (defaults.tenantId ?? null),
      action: input.action,
      actor,
      targets,
      changes,
      context: { ...defaults.context, ...input.context },
      metadata,
    };
  };

  const make = (defaults: AuditDefaults): AuditLog => ({
    store,
    async record(input) {
      const event = build(input, defaults);
      await store.insert([event]);
      return event;
    },
    async recordMany(inputs) {
      const events = inputs.map((i) => build(i, defaults));
      if (events.length > 0) await store.insert(events);
      return events;
    },
    async query(query = {}) {
      const q = toStoreQuery(
        defaults.tenantId !== undefined ? { ...query, tenantId: defaults.tenantId } : query,
      );
      // Fetch one more than requested to know whether another page exists.
      const rows = await store.query({ ...q, limit: q.limit + 1 });
      const events = rows.slice(0, q.limit);
      const last = events[events.length - 1];
      return { events, nextCursor: rows.length > q.limit && last ? encodeCursor(last) : null };
    },
    async get(id) {
      const event = await store.get(id);
      if (!event) return null;
      if (defaults.tenantId !== undefined && event.tenantId !== defaults.tenantId) return null;
      return event;
    },
    with(more) {
      return make({
        ...defaults,
        ...more,
        context: { ...defaults.context, ...more.context },
        metadata: { ...defaults.metadata, ...more.metadata },
      });
    },
  });

  return make(options.defaults ?? {});
}
