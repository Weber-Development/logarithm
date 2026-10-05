import type { AuditContext } from "./types";

export interface ContextOptions {
  /**
   * Read the client IP from proxy headers (`x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`,
   * `x-vercel-forwarded-for`). Only enable this behind a proxy that sets them, otherwise clients
   * can send any IP. Default `true`.
   */
  trustProxy?: boolean;
}

function first(headers: Headers, names: string[]): string | undefined {
  for (const name of names) {
    const value = headers.get(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

function decode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Builds the request context of an event from a Fetch API `Request` (or its headers): client IP,
 * user agent, request id and, on Vercel or Cloudflare, the city and country.
 *
 * ```ts
 * const audit = log.with({ tenantId, actor, context: contextFromRequest(request) });
 * ```
 */
export function contextFromRequest(
  request: Request | Headers,
  options: ContextOptions = {},
): AuditContext {
  const headers = request instanceof Headers ? request : request.headers;
  const context: AuditContext = {};

  if (options.trustProxy !== false) {
    const forwarded = first(headers, [
      "cf-connecting-ip",
      "x-vercel-forwarded-for",
      "x-forwarded-for",
      "x-real-ip",
    ]);
    // x-forwarded-for is "client, proxy1, proxy2": the client is the first entry.
    const ip = forwarded?.split(",")[0]?.trim();
    if (ip) context.ip = ip;
  }

  const userAgent = first(headers, ["user-agent"]);
  if (userAgent) context.userAgent = userAgent;

  const requestId = first(headers, ["x-request-id", "x-vercel-id", "cf-ray", "x-amzn-trace-id"]);
  if (requestId) context.requestId = requestId;

  const city = decode(first(headers, ["x-vercel-ip-city", "cf-ipcity"]));
  const country = first(headers, ["x-vercel-ip-country", "cf-ipcountry"]);
  const location = [city, country && country !== "XX" ? country : undefined]
    .filter(Boolean)
    .join(", ");
  if (location) context.location = location;

  return context;
}
