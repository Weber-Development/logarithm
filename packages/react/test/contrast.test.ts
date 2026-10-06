import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

/** Reads the custom properties declared in the first rule that matches `selector`. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`no rule for ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries(
    [...body.matchAll(/--lg-([a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [
      m[1] as string,
      m[2] as string,
    ]),
  );
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const PAIRS: [string, string][] = [
  ["fg", "bg"],
  ["fg", "surface"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["accent", "bg"],
  ["accent", "surface"],
  ["removed", "removed-bg"],
  ["added", "added-bg"],
];

describe.each([
  ["light", ".lg-root"],
  ["dark", '.lg-root[data-theme="dark"]'],
])("%s theme", (_name, selector) => {
  const t = { ...tokens(".lg-root"), ...tokens(selector) };
  it.each(PAIRS)("%s on %s meets WCAG AA text contrast (4.5:1)", (fg, bg) => {
    expect(contrast(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("dark theme by preference", () => {
  it("uses the same values as the explicit dark theme", () => {
    const media = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"));
    const preferred = tokens('.lg-root:not([data-theme="light"])');
    expect(media).toContain("prefers-color-scheme: dark");
    expect(preferred).toEqual(tokens('.lg-root[data-theme="dark"]'));
  });
});
