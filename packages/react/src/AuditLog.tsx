import {
  type AuditChange,
  type AuditEvent,
  type AuditQuery,
  describeAction,
} from "@sweberdev/logarithm";
import { type ReactNode, useId, useMemo, useState } from "react";
import { type AuditLogLabels, labelsFor } from "./labels";
import { type FetchPage, useAuditLog } from "./useAuditLog";

export interface AuditLogProps {
  /** URL of a `createAuditHandler` endpoint. */
  endpoint?: string;
  /** Alternative to `endpoint`: load a page yourself. */
  fetchPage?: FetchPage;
  /** Extra options for `fetch`, e.g. headers. */
  init?: RequestInit;
  /** Fixed filters the viewer cannot change, e.g. `{ targetId: project.id }`. */
  scope?: Omit<AuditQuery, "cursor" | "limit">;
  /** Entries per page. Default 25. */
  pageSize?: number;
  /** BCP 47 locale for dates and built-in labels (`en` and `de` included). Default `en`. */
  locale?: string;
  /** Override single labels. */
  labels?: Partial<AuditLogLabels>;
  /** Display names for resource types, e.g. `{ project: "Projekt" }`. */
  nouns?: Record<string, string>;
  /** Choices for the action filter, e.g. `[{ value: "project.*", label: "Projects" }]`. Hidden when empty. */
  actions?: { value: string; label: string }[];
  /** Show the filter bar. Default `true`. */
  filters?: boolean;
  /** Custom sentence for an entry (without the actor). */
  describe?: (event: AuditEvent) => ReactNode;
  /** Field labels for the changes table, e.g. `{ "billing.plan": "Plan" }`. */
  fieldLabels?: Record<string, string>;
  /** Change to reload, e.g. after recording a new event. */
  refreshKey?: unknown;
  /** Force a colour scheme. Default: follows `prefers-color-scheme`. */
  theme?: "light" | "dark";
  className?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [name.slice(0, 2)];
  return letters
    .map((p) => (p ?? "").charAt(0))
    .join("")
    .toUpperCase();
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "–";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** `datetime-local` value to ISO; empty stays undefined. */
function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function ChangesTable({
  changes,
  t,
  fieldLabels,
}: {
  changes: AuditChange[];
  t: AuditLogLabels;
  fieldLabels?: Record<string, string>;
}) {
  return (
    <table className="lg-changes">
      <caption>{t.changes}</caption>
      <thead>
        <tr>
          <th scope="col">{t.field}</th>
          <th scope="col">{t.before}</th>
          <th scope="col">{t.after}</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c) => (
          <tr key={c.field}>
            <th scope="row">{fieldLabels?.[c.field] ?? c.field}</th>
            <td>
              <del className="lg-value">{formatValue(c.before)}</del>
            </td>
            <td>
              <ins className="lg-value">{formatValue(c.after)}</ins>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Entry({
  event,
  t,
  locale,
  describe,
  fieldLabels,
}: {
  event: AuditEvent;
  t: AuditLogLabels;
  locale: string;
  describe: (event: AuditEvent) => ReactNode;
  fieldLabels?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const actorName = event.actor.name ?? event.actor.email ?? event.actor.id;
  const time = new Date(event.occurredAt);
  const contextRows = (
    [
      [t.ip, event.context.ip],
      [t.location, event.context.location],
      [t.userAgent, event.context.userAgent],
      [t.requestId, event.context.requestId],
      [t.tenant, event.tenantId ?? undefined],
      [t.eventId, event.id],
    ] as const
  ).filter(([, v]) => v);
  const metadata = Object.keys(event.metadata);

  return (
    <li className="lg-entry" data-action={event.action}>
      <span className="lg-avatar" aria-hidden="true" data-actor-type={event.actor.type}>
        {initials(actorName)}
      </span>
      <div className="lg-main">
        <p className="lg-sentence">
          <span className="lg-actor" title={event.actor.email ?? event.actor.id}>
            {actorName}
          </span>{" "}
          {describe(event)}
        </p>
        <p className="lg-meta">
          <time dateTime={event.occurredAt} title={time.toLocaleString(locale)}>
            {time.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
          </time>
          <code className="lg-action">{event.action}</code>
          {event.changes.length > 0 && (
            <span className="lg-count">{t.changeCount(event.changes.length)}</span>
          )}
        </p>
        <button
          type="button"
          className="lg-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? t.hideDetails : t.details}
        </button>
        <div id={panelId} className="lg-details" hidden={!open}>
          {open && (
            <>
              {event.changes.length > 0 && (
                <ChangesTable changes={event.changes} t={t} fieldLabels={fieldLabels} />
              )}
              <dl className="lg-context">
                {contextRows.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {metadata.length > 0 && (
                <div className="lg-metadata">
                  <p className="lg-label">{t.metadata}</p>
                  <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * A ready activity log view: filters, entries grouped by day, a diff per entry and paging.
 * Import `@sweberdev/logarithm-react/styles.css` for the default look, or style the `lg-*`
 * classes yourself.
 */
export function AuditLog(props: AuditLogProps) {
  const locale = props.locale ?? "en";
  const t = { ...labelsFor(locale), ...props.labels };
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const ids = { search: useId(), action: useId(), from: useId(), to: useId(), status: useId() };

  const query = useMemo(() => {
    const q: Omit<AuditQuery, "cursor"> = { ...props.scope, limit: props.pageSize ?? 25 };
    if (search.trim()) q.search = search.trim();
    if (action) q.action = action;
    const fromIso = fromLocalInput(from);
    if (fromIso) q.from = fromIso;
    const toIso = fromLocalInput(to);
    if (toIso) q.to = toIso;
    return q;
  }, [props.scope, props.pageSize, search, action, from, to]);

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

  const groups = useMemo(() => {
    const out: { key: string; date: Date; events: AuditEvent[] }[] = [];
    for (const event of events) {
      const key = dayKey(event.occurredAt);
      const last = out[out.length - 1];
      if (last && last.key === key) last.events.push(event);
      else out.push({ key, date: new Date(event.occurredAt), events: [event] });
    }
    return out;
  }, [events]);

  const dayLabel = (date: Date) => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (dayKey(date.toISOString()) === dayKey(today.toISOString())) return t.today;
    if (dayKey(date.toISOString()) === dayKey(yesterday.toISOString())) return t.yesterday;
    return date.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const filtered = Boolean(search || action || from || to);
  const showFilters = props.filters !== false;

  return (
    <section
      className={["lg-root", props.className].filter(Boolean).join(" ")}
      aria-busy={loading}
      data-theme={props.theme}
    >
      {showFilters && (
        <search className="lg-filters" aria-label={t.filters}>
          <div className="lg-field lg-field-search">
            <label htmlFor={ids.search}>{t.search}</label>
            <input
              id={ids.search}
              type="search"
              value={search}
              placeholder={t.searchPlaceholder}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {props.actions && props.actions.length > 0 && (
            <div className="lg-field">
              <label htmlFor={ids.action}>{t.action}</label>
              <select id={ids.action} value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="">{t.allActions}</option>
                {props.actions.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="lg-field">
            <label htmlFor={ids.from}>{t.from}</label>
            <input
              id={ids.from}
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="lg-field">
            <label htmlFor={ids.to}>{t.to}</label>
            <input
              id={ids.to}
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          {filtered && (
            <button
              type="button"
              className="lg-button lg-reset"
              onClick={() => {
                setSearch("");
                setAction("");
                setFrom("");
                setTo("");
              }}
            >
              {t.reset}
            </button>
          )}
        </search>
      )}

      <p id={ids.status} className="lg-status" aria-live="polite">
        {loading ? t.loading : error ? "" : t.results(events.length, hasMore)}
      </p>

      {error && (
        <div className="lg-error" role="alert">
          <p>{t.error}</p>
          <button type="button" className="lg-button" onClick={reload}>
            {t.retry}
          </button>
        </div>
      )}

      {!error && !loading && events.length === 0 && <p className="lg-empty">{t.empty}</p>}

      {groups.map((group) => (
        <div key={group.key} className="lg-day">
          <h3 className="lg-day-label">{dayLabel(group.date)}</h3>
          <ol className="lg-list">
            {group.events.map((event) => (
              <Entry
                key={event.id}
                event={event}
                t={t}
                locale={locale}
                describe={describe}
                fieldLabels={props.fieldLabels}
              />
            ))}
          </ol>
        </div>
      ))}

      {hasMore && !error && (
        <button type="button" className="lg-button lg-more" onClick={loadMore} disabled={loading}>
          {t.loadMore}
        </button>
      )}
    </section>
  );
}
