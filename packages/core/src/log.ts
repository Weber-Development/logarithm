import { createRedactor, DEFAULT_REDACT, diff, redactChanges, scrub } from "./diff";
import { ulid } from "./id";
import {
  AuditQueryError,
  countEvents,
  encodeCursor,
  GROUP_BY,
  MAX_LIMIT,
  sortGroups,
  toIso,
  toStoreFilter,
  toStoreQuery,
} from "./query";
import type {
  AuditActor,
  AuditContext,
  AuditCountQuery,
  AuditEvent,
  AuditEventInput,
  AuditGroupBy,
  AuditGroupCount,
  AuditPage,
  AuditQuery,
  AuditStore,
  StoreFilter,
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

// --- Typed action catalog -------------------------------------------------------------------
// Types only: a catalog changes what the compiler accepts, never what runs.

/**
 * An action catalog maps every action name to the type of its metadata, e.g.
 * `{ "project.created": {}; "invoice.paid": { amount: number; currency: string } }`.
 * Without a catalog, every action name and any metadata are accepted.
 */
export type AnyActions = Record<string, Record<string, unknown>>;

/** The action names of a catalog. */
export type ActionName<A> = keyof A & string;

type ActionPrefixes<S extends string> = S extends `${infer Head}.${infer Tail}`
  ? Head | `${Head}.${ActionPrefixes<Tail>}`
  : never;

/** A query filter for actions: a known action, a prefix of known actions like `project.*`, or `*`. */
export type ActionPattern<A> = ActionName<A> | `${ActionPrefixes<ActionName<A>>}.*` | "*";

/** Metadata is required when the catalog type of an action has required fields. */
type MetadataInput<M> = Record<never, never> extends M ? { metadata?: M } : { metadata: M };

type RecordInputBase = Omit<AuditEventInput, "action" | "metadata" | "actor"> & {
  actor?: AuditActor;
};

/** What you pass to `record()`. With a catalog, `action` and `metadata` are checked against it. */
export type AuditRecordInput<A = AnyActions> = {
  [K in ActionName<A>]: RecordInputBase & { action: K } & MetadataInput<A[K]>;
}[ActionName<A>];

/** A stored event whose action belongs to the catalog. */
export type AuditEventOf<A = AnyActions> = AuditEvent & { action: ActionName<A> };

/** `AuditQuery` with action filters checked against the catalog. */
export type AuditQueryOf<A = AnyActions> = Omit<AuditQuery, "action"> & {
  action?: ActionPattern<A> | ActionPattern<A>[];
};

/** `AuditCountQuery` with action filters checked against the catalog. */
export type AuditCountQueryOf<A = AnyActions> = Omit<AuditQueryOf<A>, "limit" | "cursor">;

export interface AuditLog<A extends Record<keyof A, object> = AnyActions> {
  /** Records one event and returns it as stored. */
  record(input: AuditRecordInput<A>): Promise<AuditEventOf<A>>;
  /** Records several events in one write. */
  recordMany(inputs: AuditRecordInput<A>[]): Promise<AuditEventOf<A>[]>;
  /** Lists events, newest first, one page at a time. */
  query(query?: AuditQueryOf<A>): Promise<AuditPage<AuditEventOf<A>>>;
  /**
   * Counts the events per UTC day, action or actor id that match the filters. Days come oldest
   * first, actions and actors by count descending.
   */
  count(query: AuditCountQueryOf<A> & { groupBy: AuditGroupBy }): Promise<AuditGroupCount[]>;
  /** Counts the events that match the filters (the same filters as `query`, without paging). */
  count(query?: AuditCountQueryOf<A> & { groupBy?: undefined }): Promise<number>;
  /** Returns one event or `null`. */
  get(id: string): Promise<AuditEventOf<A> | null>;
  /** A log that adds these defaults to every event, e.g. per request: `log.with({ tenantId, actor })`. */
  with(defaults: AuditDefaults): AuditLog<A>;
  readonly store: AuditStore;
}

/** Counts by paging through `query`, for stores without their own `count`. */
async function countByScanning(
  store: AuditStore,
  filter: StoreFilter,
  groupBy?: AuditGroupBy,
): Promise<AuditGroupCount[]> {
  const totals = new Map<string, number>();
  let before: { occurredAt: string; id: string } | undefined;
  for (;;) {
    const page = await store.query({ ...filter, limit: MAX_LIMIT, ...(before ? { before } : {}) });
    for (const group of countEvents(page, {}, groupBy)) {
      totals.set(group.key, (totals.get(group.key) ?? 0) + group.count);
    }
    const last = page[page.length - 1];
    if (page.length < MAX_LIMIT || !last) break;
    before = { occurredAt: last.occurredAt, id: last.id };
  }
  if (!groupBy) return [{ key: "", count: totals.get("") ?? 0 }];
  return Array.from(totals, ([key, count]) => ({ key, count }));
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
 *
 * Pass an action catalog to have the compiler check action names, filters and metadata:
 *
 * ```ts
 * type Actions = { "project.updated": {}; "invoice.paid": { amount: number } }
 * const audit = createAuditLog<Actions>({ store })
 * ```
 */
export function createAuditLog<A extends Record<keyof A, object> = AnyActions>(
  options: AuditLogOptions,
): AuditLog<A> {
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

  const scope = <Q extends AuditCountQuery>(query: Q, defaults: AuditDefaults): Q =>
    defaults.tenantId !== undefined ? { ...query, tenantId: defaults.tenantId } : query;

  const make = (defaults: AuditDefaults): AuditLog => ({
    store,
    count: (async (query: AuditCountQuery & { groupBy?: AuditGroupBy } = {}) => {
      const { groupBy, ...rest } = query;
      if (groupBy !== undefined && !GROUP_BY.includes(groupBy)) {
        throw new AuditQueryError(`groupBy must be one of ${GROUP_BY.join(", ")}`);
      }
      const filter = toStoreFilter(scope(rest, defaults));
      const groups = store.count
        ? await store.count(filter, groupBy)
        : await countByScanning(store, filter, groupBy);
      if (!groupBy) return groups.reduce((total, g) => total + g.count, 0);
      return sortGroups(groups, groupBy);
    }) as AuditLog["count"],
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
      const q = toStoreQuery(scope(query as AuditQuery, defaults));
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

  return make(options.defaults ?? {}) as unknown as AuditLog<A>;
}
