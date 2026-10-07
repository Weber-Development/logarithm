import { type AuditEvent, type AuditQuery, describeAction } from "@sweberdev/logarithm";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { initials } from "./AuditLog";
import { type AuditLogLabels, labelsFor } from "./labels";
import { type FetchPage, useAuditLog } from "./useAuditLog";

export interface ActivityFeedProps {
  /** URL of a `createAuditHandler` endpoint. */
  endpoint?: string;
  /** Alternative to `endpoint`: load a page yourself. */
  fetchPage?: FetchPage;
  /** Extra options for `fetch`, e.g. headers. */
  init?: RequestInit;
  /** Fixed filters, e.g. `{ targetId: project.id }` for the activity of one project. */
  scope?: Omit<AuditQuery, "cursor" | "limit">;
  /** Number of entries. Default 5. */
  limit?: number;
  /** BCP 47 locale for times and built-in labels (`en`, `de`, `fr` and `it` included). Default `en`. */
  locale?: string;
  /** Override single labels. */
  labels?: Partial<AuditLogLabels>;
  /** Display names for resource types, e.g. `{ project: "Projekt" }`. */
  nouns?: Record<string, string>;
  /** Custom sentence for an entry (without the actor). */
  describe?: (event: AuditEvent) => ReactNode;
  /** Heading above the list. Pass `null` to hide it. Default: "Recent activity". */
  title?: ReactNode;
  /** Link to the full log, e.g. `/settings/audit-log`. */
  href?: string;
  /** Change to reload, e.g. after recording a new event. */
  refreshKey?: unknown;
  /** Force a colour scheme. Default: follows `prefers-color-scheme`. */
  theme?: "light" | "dark";
  className?: string;
}

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 60],
  ["minute", 60],
  ["hour", 24],
  ["day", 7],
  ["week", 4.35],
  ["month", 12],
  ["year", Number.POSITIVE_INFINITY],
];

/**
 * "5 minutes ago" in the given locale; "just now" below a minute.
 * @deprecated Internal helper, not part of the supported API. It will be removed from the public exports in 0.9.
 */
export function relativeTime(iso: string, now: number, locale: string, justNow: string): string {
  let value = (new Date(iso).getTime() - now) / 1000;
  if (Math.abs(value) < 60) return justNow;
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of STEPS) {
    if (Math.abs(value) < size) return format.format(Math.round(value), unit);
    value /= size;
  }
  return format.format(Math.round(value), "year");
}

/** Re-renders every 30 seconds so relative times stay current. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * A compact list of the latest events for dashboards and side panels, with relative times and a
 * link to the full log. Uses the same endpoint and styles as `<AuditLog>`.
 */
export function ActivityFeed(props: ActivityFeedProps) {
  const locale = props.locale ?? "en";
  const t = { ...labelsFor(locale), ...props.labels };
  const now = useNow();
  const query = useMemo(
    () => ({ ...props.scope, limit: props.limit ?? 5 }),
    [props.scope, props.limit],
  );
  const { events, loading, error, reload } = useAuditLog({
    endpoint: props.endpoint,
    fetchPage: props.fetchPage,
    init: props.init,
    query,
    refreshKey: props.refreshKey,
  });
  const describe =
    props.describe ??
    ((event: AuditEvent) => describeAction(event, { locale, nouns: props.nouns }));
  const title = props.title === undefined ? t.recentActivity : props.title;

  return (
    <section
      className={["lg-root", "lg-feed", props.className].filter(Boolean).join(" ")}
      aria-busy={loading}
      data-theme={props.theme}
    >
      {title !== null && <h3 className="lg-feed-title">{title}</h3>}
      {error && (
        <div className="lg-error" role="alert">
          <p>{t.error}</p>
          <button type="button" className="lg-button" onClick={reload}>
            {t.retry}
          </button>
        </div>
      )}
      {loading && events.length === 0 && <p className="lg-status">{t.loading}</p>}
      {!error && !loading && events.length === 0 && <p className="lg-empty">{t.noActivity}</p>}
      {events.length > 0 && (
        <ol className="lg-list">
          {events.map((event) => {
            const actorName = event.actor.name ?? event.actor.email ?? event.actor.id;
            return (
              <li key={event.id} className="lg-entry lg-feed-entry" data-action={event.action}>
                <span className="lg-avatar" aria-hidden="true" data-actor-type={event.actor.type}>
                  {initials(actorName)}
                </span>
                <div className="lg-main">
                  <p className="lg-sentence">
                    <span className="lg-actor">{actorName}</span> {describe(event)}
                  </p>
                  <p className="lg-meta">
                    <time
                      dateTime={event.occurredAt}
                      title={new Date(event.occurredAt).toLocaleString(locale)}
                    >
                      {relativeTime(event.occurredAt, now, locale, t.justNow)}
                    </time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {props.href && (
        <a className="lg-feed-link" href={props.href}>
          {t.viewAll}
        </a>
      )}
    </section>
  );
}
