# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/Weber-Development/logarithm/security/advisories/new)
and do not open a public issue. Include the version, what you did and what happened. You get an
answer within five working days, and a fix or a mitigation plan within 30 days for confirmed issues.

## Scope

`@sweberdev/logarithm` and `@sweberdev/logarithm-react` (this repository), in particular:

- values that should be redacted but are stored (see `DEFAULT_REDACT`),
- reading or writing another tenant's events through a scoped log or the HTTP handler,
- SQL injection through query parameters or options,
- cross-site scripting in the React viewer.

## Supported versions

Security fixes go into the latest minor version. Update with `pnpm update @sweberdev/logarithm`.

## How releases are built

Packages are published from GitHub Actions with npm provenance, so each version on npm links to
the commit and workflow that built it.
