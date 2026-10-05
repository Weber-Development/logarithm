import type { AuditEvent, AuditPage, AuditQuery } from "@sweberdev/logarithm";
import { useCallback, useEffect, useRef, useState } from "react";

export type FetchPage = (query: AuditQuery) => Promise<AuditPage>;

export interface UseAuditLogOptions {
  /** URL of a `createAuditHandler` endpoint. */
  endpoint?: string;
  /** Alternative to `endpoint`: load a page yourself, e.g. with a server action. */
  fetchPage?: FetchPage;
  /** Filters. A new object (by value) reloads from the first page. */
  query?: Omit<AuditQuery, "cursor">;
  /** Extra options for `fetch`, e.g. headers. */
  init?: RequestInit;
  /** Change this value to reload, e.g. after recording a new event. */
  refreshKey?: unknown;
}

export interface UseAuditLogResult {
  events: AuditEvent[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  loadMore(): void;
  reload(): void;
}

/** Builds the query string `createAuditHandler` understands. */
export function toSearchParams(query: AuditQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (query.actorId) params.set("actor", query.actorId);
  const actions = Array.isArray(query.action) ? query.action : query.action ? [query.action] : [];
  if (actions.length) params.set("action", actions.join(","));
  if (query.targetId) params.set("target", query.targetId);
  if (query.targetType) params.set("targetType", query.targetType);
  if (query.from) params.set("from", new Date(query.from).toISOString());
  if (query.to) params.set("to", new Date(query.to).toISOString());
  if (query.search) params.set("q", query.search);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  return params;
}

export function endpointFetcher(endpoint: string, init?: RequestInit): FetchPage {
  return async (query) => {
    const separator = endpoint.includes("?") ? "&" : "?";
    const res = await fetch(`${endpoint}${separator}${toSearchParams(query)}`, {
      ...init,
      headers: { accept: "application/json", ...init?.headers },
    });
    if (!res.ok) throw new Error(`Audit log request failed with status ${res.status}`);
    return (await res.json()) as AuditPage;
  };
}

/** Loads audit events page by page. Used by `<AuditLog>`; use it directly for your own layout. */
export function useAuditLog(options: UseAuditLogOptions): UseAuditLogResult {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [generation, setGeneration] = useState(0);
  const latest = useRef(options);
  latest.current = options;
  const request = useRef(0);
  const key = JSON.stringify(options.query ?? {});

  const load = useCallback(async (from: string | null, append: boolean) => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    const { endpoint, fetchPage, init, query } = latest.current;
    const fetcher = fetchPage ?? (endpoint ? endpointFetcher(endpoint, init) : null);
    if (!fetcher) {
      setError(new Error("Pass endpoint or fetchPage"));
      setLoading(false);
      return;
    }
    try {
      const page = await fetcher({ ...query, cursor: from });
      if (id !== request.current) return; // a newer request superseded this one
      setEvents((prev) => (append ? [...prev, ...page.events] : page.events));
      setCursor(page.nextCursor);
    } catch (e) {
      if (id !== request.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when the filters, refreshKey or generation change
  useEffect(() => {
    void load(null, false);
  }, [key, options.refreshKey, generation, load]);

  return {
    events,
    loading,
    error,
    hasMore: cursor !== null,
    loadMore: () => {
      if (cursor && !loading) void load(cursor, true);
    },
    reload: () => setGeneration((g) => g + 1),
  };
}
