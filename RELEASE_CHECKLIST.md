# Release checklist (package-launch)

Stand 2026-10-05.

| Item | Status |
|---|---|
| Repo `Weber-Development/logarithm` | private; make it public before the docs can render (they are read from GitHub) |
| npm `@sweberdev/logarithm`, `@sweberdev/logarithm-react` | first changeset on `main` → "version packages" PR → merge publishes 0.1.0 |
| packages.sweber.dev | entry, docs config and live demo in `sxwxbxr/portfoliov3` (PR `packages/logarithm`) |
| Docs | Markdown in `docs/` with `nav.json`, rendered at packages.sweber.dev/logarithm/docs |
| Pro | `Weber-Development/logarithm-pro` and `-pro-dist`, see `RELEASE_CHECKLIST.md` there |
| Polar | waits for price confirmation, then `polar-setup.yml` in the Werkbank |
| Trademark check "Logarithm" | open (Seya) |

## Open (Seya)

- [ ] Merge the first PR, then the "version packages" PR (publishes to npm).
- [ ] Make the repository public (`go-public.yml` in the Werkbank, Claude starts it on request).
- [ ] Confirm Pro prices.
- [ ] Trademark check.

## Later

- Stores for MySQL and libSQL/Turso, Drizzle schema export.
- `<AuditLog>` translations for French and Italian.
