---
title: React viewer
description: Show the audit log to your customers' admins.
---

```tsx
import { AuditLog } from "@sweberdev/logarithm-react"
import "@sweberdev/logarithm-react/styles.css"

<AuditLog
  endpoint="/api/audit"
  locale="de-CH"
  nouns={{ project: "Projekt", member: "Mitglied" }}
  actions={[
    { value: "project.*", label: "Projekte" },
    { value: "member.*", label: "Mitglieder" },
  ]}
  fieldLabels={{ "billing.plan": "Abo" }}
/>
```

The view shows entries grouped by day, with a sentence such as "Anna Muster hat Projekt „Website“ geändert", the time and the action. **Details** opens the field changes, the request context and metadata.

## Props

| Prop | Default | Meaning |
|---|---|---|
| `endpoint` | – | URL of a `createAuditHandler` route |
| `fetchPage` | – | Load a page yourself instead, e.g. a server action |
| `scope` | – | Fixed filters, e.g. `{ targetId: project.id }` for a project's history tab |
| `pageSize` | `25` | Entries per page |
| `locale` | `en` | Dates and built-in labels; English, German, French and Italian are included |
| `labels` | – | Override single labels |
| `nouns` | – | Display names for resource types |
| `actions` | – | Choices for the action filter; hidden when empty |
| `filters` | `true` | Show search, action and date filters |
| `describe` | – | Your own sentence per event |
| `fieldLabels` | – | Readable names for changed fields |
| `refreshKey` | – | Change it to reload |
| `theme` | system | `light` or `dark` |

## Styling

The stylesheet uses custom properties on `.lg-root`. Override them to match your app, or leave the stylesheet out and style the `lg-*` classes yourself:

```css
.lg-root {
  --lg-accent: #0f766e;
  --lg-radius: 2px;
  --lg-font: "Inter", sans-serif;
}
```

Dark mode follows `prefers-color-scheme`; force a scheme with `theme="light"` or `theme="dark"`.

## Accessibility

Filters have visible labels, the details button announces its state with `aria-expanded`, the result count is a polite live region, the changes table has a caption and header cells, and focus is always visible.

## Languages

English, German, French and Italian labels and sentences are built in and chosen by `locale`, e.g. `de-CH`, `fr-CH` or `it-CH`. Pass resource names with `nouns`. In French and Italian, include the article, because it depends on the noun:

```tsx
<AuditLog endpoint="/api/audit" locale="fr-CH" nouns={{ project: "le projet", member: "le membre" }} />
// Anna Muster a modifié le projet « Website »
```

For other languages, pass your own `labels` and a `describe` function.

## Activity feed

`<ActivityFeed>` is a compact list of the latest events for a dashboard or a side panel. It uses the same endpoint and stylesheet as `<AuditLog>`, shows relative times ("5 minutes ago", in German "vor 5 Minuten") and links to the full log.

```tsx
<ActivityFeed endpoint="/api/audit" limit={5} href="/settings/activity" locale="de-CH" />
```

Pass `scope={{ targetId: project.id }}` to show the activity of one object, e.g. on a project page, and `title={null}` to hide the heading. The other props match `<AuditLog>`: `fetchPage`, `init`, `labels`, `nouns`, `describe`, `refreshKey`, `theme` and `className`.

## Your own layout

`useAuditLog({ endpoint, query })` returns `events`, `loading`, `error`, `hasMore`, `loadMore()` and `reload()`. `describeAction(event, { locale })` from the core package builds the sentence.

## Accessibility and theming

The default stylesheet meets WCAG 2.2 AA text contrast (4.5:1) in the light and the dark theme for every pair of text and background colour, which the test suite checks on every release. Expanding a row uses a button with `aria-expanded` and `aria-controls`, filters sit in a labelled `search` landmark, result counts are announced through a polite live region, and errors use `role="alert"`. All controls are reachable by keyboard and show a focus ring.

Colours, radius and fonts are CSS custom properties on `.lg-root` (`--lg-bg`, `--lg-fg`, `--lg-muted`, `--lg-border`, `--lg-surface`, `--lg-accent`, `--lg-removed`, `--lg-added`, `--lg-radius`, `--lg-font`, `--lg-mono`). Dark mode follows `prefers-color-scheme`; force a theme with `data-theme="light"` or `data-theme="dark"` on the root element. If you change the colours, keep the 4.5:1 contrast between text and its background.

