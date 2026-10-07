# Accessibility audit

Renders the viewer in a real browser and runs axe-core (WCAG 2.0, 2.1 and 2.2 level A and AA plus best practices) in the light theme, the dark theme (forced and from the system setting) and German, then tabs through the controls.

```bash
pnpm --filter @sweberdev/logarithm-react build
cd audits/a11y && npm install && npm run build
CHROMIUM_PATH=/path/to/chrome npm run audit    # axe-core
CHROMIUM_PATH=/path/to/chrome npm run keyboard # tab order, focus ring, Enter and Space
```

This folder is not part of the workspace and not run in CI; it needs a browser. Run it before a release that changes the viewer.
