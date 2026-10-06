import type { AnyActions, AuditLog, AuditQueryOf } from "./log";
import { AuditQueryError, MAX_LIMIT } from "./query";
import type { AuditQuery } from "./types";

export interface AuditAccess {
  /** The tenant whose events this request may read. `null` for single-tenant apps. */
  tenantId: string | null;
}

export interface AuditHandlerOptions<A extends Record<keyof A, object> = AnyActions> {
  log: AuditLog<A>;
  /**
   * Decides who may read the log. Return the tenant the caller may see, or `null` to answer 403.
   * This is the only access check, so look up the session here.
   */
  authorize(request: Request): AuditAccess | null | Promise<AuditAccess | null>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Reads the query parameters the React viewer sends. Unknown parameters are ignored. */
export function parseQueryParams(params: URLSearchParams): AuditQuery {
  const q: AuditQuery = {};
  const actor = params.get("actor");
  if (actor) q.actorId = actor;
  const actions = params.getAll("action").flatMap((a) => a.split(","));
  if (actions.length > 0) q.action = actions;
  const target = params.get("target");
  if (target) q.targetId = target;
  const targetType = params.get("targetType");
  if (targetType) q.targetType = targetType;
  const from = params.get("from");
  if (from) q.from = from;
  const to = params.get("to");
  if (to) q.to = to;
  const search = params.get("q");
  if (search) q.search = search;
  const cursor = params.get("cursor");
  if (cursor) q.cursor = cursor;
  const limit = params.get("limit");
  if (limit) q.limit = Math.min(Number(limit), MAX_LIMIT);
  return q;
}

/**
 * A request handler for the audit log viewer, based on the Fetch API. Works in Next.js route
 * handlers, Remix, Hono, Bun, Deno and Cloudflare Workers.
 *
 * `GET ?actor=&action=&target=&targetType=&from=&to=&q=&cursor=&limit=` returns a page,
 * `GET ?id=` one event.
 */
export function createAuditHandler<A extends Record<keyof A, object> = AnyActions>(
  options: AuditHandlerOptions<A>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "GET") {
      return new Response(null, { status: 405, headers: { allow: "GET" } });
    }
    const access = await options.authorize(request);
    if (!access) return json({ error: "forbidden" }, 403);
    const log = options.log.with({ tenantId: access.tenantId });
    const params = new URL(request.url).searchParams;
    try {
      const id = params.get("id");
      if (id) {
        const event = await log.get(id);
        return event ? json(event) : json({ error: "not_found" }, 404);
      }
      // Action names from the URL are not checked against the catalog; unknown ones match nothing.
      return json(await log.query(parseQueryParams(params) as AuditQueryOf<A>));
    } catch (error) {
      if (error instanceof AuditQueryError) return json({ error: error.message }, 400);
      throw error;
    }
  };
}
