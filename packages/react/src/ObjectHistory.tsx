import { type AuditEvent, type AuditQuery, describeAction } from "@sweberdev/logarithm";
import { type ReactNode, useId, useMemo, useState } from "react";
import { Heading, initials } from "./AuditLog";
import { type AuditLogLabels, labelsFor } from "./labels";
import { OutcomeBadge } from "./OutcomeBadge";
import { type FetchPage, useAuditLog } from "./useAuditLog";

export interface ObjectHistoryProps {
  /** URL of a `createAuditHandler` endpoint. */
  endpoint?: string;
  /** Alternative to `endpoint`: load a page yourself. */
  fetchPage?: FetchPage;
  /** Extra options for `fetch`, e.g. headers. */
  init?: RequestInit;
  /** The kind of object, e.g. `project`. */
  targetType: string;
  /** The id of the object. */
  targetId: string;
  /** Further fixed filters, e.g. the tenant. */
  scope?: Omit<AuditQuery, "cursor" | "limit" | "targetId" | "targetType">;
  /** Entries per page. Default 20. */
  pageSize?: number;
  /** BCP 47 locale for dates and built-in labels (`en`, `de`, `fr`, `it`). Default `en`. */
  locale?: string;
  labels?: Partial<AuditLogLabels>;
  nouns?: Record<string, string>;
  /** Field labels, e.g. `{ "billing.plan": "Plan" }`. */
  fieldLabels?: Record<string, string>;
  describe?: (event: AuditEvent) => ReactNode;
  refreshKey?: unknown;
  theme?: "light" | "dark";
  /** Heading level of the title (2 to 5). Default 3. */
  headingLevel?: 2 | 3 | 4 | 5;
  /** Title above the history; `null` leaves it out. Default: the translated word for history. */
  title?: string | null;
  className?: string;
}

function show(value: unknown): string {
  if (value === undefined || value === null || value === "") return "–";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

/**
 * The history of one object (a project, an invoice, a member): every recorded change with who made
 * it, when, and the before and after value of each field. A filter narrows it to the changes of a
 * single field, so "who changed the plan, and when" is one click. Uses the same endpoint as
 * `<AuditLog>`.
 */
export function ObjectHistory(props: ObjectHistoryProps) {
  const locale = props.locale ?? "en";
  const t = { ...labelsFor(locale), ...props.labels };
  const [field, setField] = useState("");
  const fieldId = useId();

  const query = useMemo(
    () => ({
      ...props.scope,
      targetType: props.targetType,
      targetId: props.targetId,
      limit: props.pageSize ?? 20,
    }),
    [props.scope, props.targetType, props.targetId, props.pageSize],
  );
  const { events, loading, error, hasMore, loadMore, reload } = useAuditLog({
    endpoint: props.endpoint,
    fetchPage: props.fetchPage,
    init: props.init,
    query,
    refreshKey: props.refreshKey,
  });

  const describe =
    props.describe ??
    ((event: AuditEvent) => describeAction(event, { locale, nouns: props.nouns }));
  const label = (name: string) => props.fieldLabels?.[name] ?? name;

  const fields = useMemo(
    () => [...new Set(events.flatMap((e) => e.changes.map((c) => c.field)))].sort(),
    [events],
  );
  const shown = field ? events.filter((e) => e.changes.some((c) => c.field === field)) : events;
  const title = props.title === undefined ? t.history : props.title;

  return (
    <section
      className={["lg-root", "lg-object-history", props.className].filter(Boolean).join(" ")}
      aria-busy={loading}
      data-theme={props.theme}
    >
      {title !== null && (
        <Heading level={props.headingLevel ?? 3} className="lg-feed-title">
          {title}
        </Heading>
      )}
      {fields.length > 0 && (
        <div className="lg-field">
          <label htmlFor={fieldId}>{t.historyField}</label>
          <select id={fieldId} value={field} onChange={(e) => setField(e.target.value)}>
            <option value="">{t.allFields}</option>
            {fields.map((f) => (
              <option key={f} value={f}>
                {label(f)}
              </option>
            ))}
          </select>
        </div>
      )}
      {error && (
        <div className="lg-error" role="alert">
          <p>{t.error}</p>
          <button type="button" className="lg-button" onClick={reload}>
            {t.retry}
          </button>
        </div>
      )}
      {loading && events.length === 0 && <p className="lg-status">{t.loading}</p>}
      {!error && !loading && shown.length === 0 && <p className="lg-empty">{t.noHistory}</p>}
      {shown.length > 0 && (
        <ol className="lg-history">
          {shown.map((event) => {
            const actorName = event.actor.name ?? event.actor.email ?? event.actor.id;
            const time = new Date(event.occurredAt);
            const changes = field ? event.changes.filter((c) => c.field === field) : event.changes;
            return (
              <li key={event.id} className="lg-history-entry" data-action={event.action}>
                <p className="lg-history-head">
                  <time dateTime={event.occurredAt} className="lg-meta">
                    {time.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                  <span className="lg-sentence">
                    <span className="lg-actor" title={event.actor.email ?? event.actor.id}>
                      {actorName || initials(event.actor.id)}
                    </span>{" "}
                    {describe(event)}
                  </span>
                  <OutcomeBadge outcome={event.outcome} t={t} />
                </p>
                {changes.length > 0 && (
                  <ul className="lg-diff" aria-label={t.changes}>
                    {changes.map((c) => (
                      <li key={c.field}>
                        <span className="lg-diff-field">{label(c.field)}</span>
                        <span>
                          <span className="lg-sr">{t.before}: </span>
                          <del className="lg-value">{show(c.before)}</del>
                        </span>
                        <span aria-hidden="true">→</span>
                        <span>
                          <span className="lg-sr">{t.after}: </span>
                          <ins className="lg-value">{show(c.after)}</ins>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {hasMore && !error && (
        <button type="button" className="lg-button lg-more" onClick={loadMore} disabled={loading}>
          {t.loadMore}
        </button>
      )}
    </section>
  );
}
