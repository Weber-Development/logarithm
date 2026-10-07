/**
 * Version of the table layout the built-in stores create. It is stored next to the audit table in
 * `<table>_meta`, so a later release can tell which layout a database has and migrate it.
 */
export const SCHEMA_VERSION = 1;

/** The database was created by a newer version of Logarithm than the one running. */
export class SchemaVersionError extends Error {
  readonly found: number;
  readonly supported: number;

  constructor(found: number) {
    super(
      `The audit table has schema version ${found}, but this version of Logarithm supports up to ${SCHEMA_VERSION}. Update Logarithm before running migrations.`,
    );
    this.name = "SchemaVersionError";
    this.found = found;
    this.supported = SCHEMA_VERSION;
  }
}

/** Throws a {@link SchemaVersionError} when the stored version is newer than this release knows. */
export function assertSchemaVersion(found: number | null): void {
  if (found !== null && found > SCHEMA_VERSION) throw new SchemaVersionError(found);
}

/** Reads the stored value; anything that is not a whole number counts as unknown. */
export function parseSchemaVersion(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
