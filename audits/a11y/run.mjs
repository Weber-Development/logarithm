import { readFileSync } from "node:fs";
import http from "node:http";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";

const types = { html: "text/html", js: "text/javascript", css: "text/css" };
const server = http
  .createServer((req, res) => {
    const path = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
    try {
      res.writeHead(200, { "content-type": types[path.split(".").pop()] });
      res.end(readFileSync(`.${path}`));
    } catch {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(4177);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let failed = 0;
for (const [name, query, scheme] of [
  ["light", "", "light"],
  ["dark (forced)", "?theme=dark", "light"],
  ["dark (system)", "", "dark"],
  ["de", "?locale=de", "light"],
]) {
  const ctx = await browser.newContext({
    colorScheme: scheme,
    viewport: { width: 1000, height: 900 },
  });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:4177/${query}`);
  await page.waitForSelector(".lg-root");
  await page.waitForTimeout(500);
  // expand a changes row if there is one
  const buttons = await page.$$("button[aria-expanded='false']");
  if (buttons[0]) await buttons[0].click();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
    .analyze();
  console.log(
    `${name}: ${results.violations.length} violations, ${results.passes.length} passed rules, ${results.incomplete.length} need review`,
  );
  for (const v of results.violations) {
    failed++;
    console.log(
      " -",
      v.id,
      v.impact,
      v.help,
      v.nodes
        .slice(0, 3)
        .map(
          (n) =>
            `${n.target.join(" ")} | ${(n.failureSummary || "").split("\n").slice(1, 3).join(" ")}`,
        )
        .join("\n     "),
    );
  }
  for (const v of results.incomplete) console.log("   review:", v.id, v.nodes.length);
  await ctx.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
