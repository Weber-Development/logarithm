import type { AuditChange } from "./types";

export const REDACTED = "[redacted]";

/** Field names whose values are never stored. Matched case-insensitively against the last path segment. */
export const DEFAULT_REDACT = [
  "password",
  "passwordHash",
  "secret",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "privateKey",
  "otp",
  "totpSecret",
  "cardNumber",
  "cvc",
  "iban",
];

export interface DiffOptions {
  /** Fields to leave out entirely, as dot paths (`updatedAt`, `billing.lastSync`). */
  ignore?: string[];
  /** Field names whose values are replaced by `[redacted]`. Default: {@link DEFAULT_REDACT}. */
  redact?: string[];
  /** Nested objects deeper than this are compared as a whole. Default 6. */
  maxDepth?: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Converts values to what JSON storage will return, so a diff and its stored form agree. */
function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (value === undefined) return undefined;
  return value;
}

/** Replaces values of sensitive keys anywhere inside a value. */
export function scrub(value: unknown, isRedacted: (field: string) => boolean): unknown {
  if (Array.isArray(value)) return value.map((v) => scrub(v, isRedacted));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = isRedacted(key) ? REDACTED : scrub(normalize(v), isRedacted);
    }
    return out;
  }
  return value;
}

function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function createRedactor(redact: string[] = DEFAULT_REDACT): (field: string) => boolean {
  const names = new Set(redact.map((r) => r.toLowerCase()));
  return (field) => {
    const last = field.split(".").pop() ?? field;
    return names.has(last.toLowerCase());
  };
}

/**
 * Lists the fields that differ between two object states. Nested objects are walked and reported as
 * dot paths, arrays are compared as a whole. Values of sensitive fields are replaced by `[redacted]`.
 *
 * ```ts
 * diff({ name: "Old", plan: "free" }, { name: "New", plan: "free" })
 * // [{ field: "name", before: "Old", after: "New" }]
 * ```
 */
export function diff(before: unknown, after: unknown, options: DiffOptions = {}): AuditChange[] {
  const ignore = new Set(options.ignore ?? []);
  const isRedacted = createRedactor(options.redact);
  const maxDepth = options.maxDepth ?? 6;
  const changes: AuditChange[] = [];

  const walk = (a: unknown, b: unknown, path: string, depth: number) => {
    if (path && ignore.has(path)) return;
    if (isPlainObject(a) && isPlainObject(b) && depth < maxDepth && !(path && isRedacted(path))) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of [...keys].sort()) {
        walk(a[key], b[key], path ? `${path}.${key}` : key, depth + 1);
      }
      return;
    }
    const na = normalize(a);
    const nb = normalize(b);
    if (equal(na, nb)) return;
    const field = path || "(root)";
    const change: AuditChange = { field };
    if (isRedacted(field)) {
      if (na !== undefined) change.before = REDACTED;
      if (nb !== undefined) change.after = REDACTED;
    } else {
      if (na !== undefined) change.before = scrub(na, isRedacted);
      if (nb !== undefined) change.after = scrub(nb, isRedacted);
    }
    changes.push(change);
  };

  walk(before ?? {}, after ?? {}, "", 0);
  return changes;
}

/** Replaces values of sensitive fields in explicitly passed changes. */
export function redactChanges(changes: AuditChange[], redact?: string[]): AuditChange[] {
  const isRedacted = createRedactor(redact);
  return changes.map((c) => {
    if (!isRedacted(c.field)) {
      const out: AuditChange = { field: c.field };
      if (c.before !== undefined) out.before = scrub(normalize(c.before), isRedacted);
      if (c.after !== undefined) out.after = scrub(normalize(c.after), isRedacted);
      return out;
    }
    const out: AuditChange = { field: c.field };
    if (c.before !== undefined) out.before = REDACTED;
    if (c.after !== undefined) out.after = REDACTED;
    return out;
  });
}
