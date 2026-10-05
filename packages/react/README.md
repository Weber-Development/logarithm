# @sweberdev/logarithm-react

A ready-made audit log view for [Logarithm](https://www.npmjs.com/package/@sweberdev/logarithm): search and filters, entries grouped by day, a field-level diff per entry and paging. Accessible, themeable with CSS custom properties, English and German built in.

```sh
npm i @sweberdev/logarithm @sweberdev/logarithm-react
```

```tsx
import { AuditLog } from "@sweberdev/logarithm-react"
import "@sweberdev/logarithm-react/styles.css"

export function Activity() {
  return (
    <AuditLog
      endpoint="/api/audit"
      locale="de-CH"
      nouns={{ project: "Projekt" }}
      actions={[{ value: "project.*", label: "Projekte" }]}
    />
  )
}
```

`endpoint` points to a route made with `createAuditHandler` from the core package. Use `fetchPage` instead to load pages with a server action, or `useAuditLog` for your own layout.

Documentation: [packages.sweber.dev/logarithm/docs/guides/react](https://packages.sweber.dev/logarithm/docs/guides/react)

MIT licensed.
