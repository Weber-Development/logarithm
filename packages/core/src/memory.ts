import { compareEvents, countEvents, matches } from "./query";
import type { AuditActor, AuditEvent, AuditStore, StoreQuery } from "./types";

/**
 * Keeps events in memory. For tests, demos and prototypes; everything is lost on restart.
 */
export function memoryStore(initial: AuditEvent[] = []): AuditStore & { events: AuditEvent[] } {
  const events: AuditEvent[] = structuredClone(initial);
  return {
    events,
    async insert(batch) {
      for (const event of batch) {
        if (events.some((e) => e.id === event.id))
          throw new Error(`Duplicate event id ${event.id}`);
      }
      events.push(...structuredClone(batch));
    },
    async query(q: StoreQuery) {
      return structuredClone(
        events
          .filter((e) => matches(e, q))
          .sort(compareEvents)
          .slice(0, q.limit),
      );
    },
    async count(filter, groupBy) {
      return countEvents(events, filter, groupBy);
    },
    async get(id) {
      const event = events.find((e) => e.id === id);
      return event ? structuredClone(event) : null;
    },
    async deleteBefore(before, tenantId) {
      let removed = 0;
      for (let i = events.length - 1; i >= 0; i--) {
        const e = events[i] as AuditEvent;
        if (e.occurredAt < before && (tenantId === undefined || e.tenantId === tenantId)) {
          events.splice(i, 1);
          removed++;
        }
      }
      return removed;
    },
    async rewriteActor(actorId: string, actor: AuditActor) {
      let changed = 0;
      for (const e of events) {
        if (e.actor.id === actorId) {
          e.actor = structuredClone(actor);
          changed++;
        }
      }
      return changed;
    },
  };
}
