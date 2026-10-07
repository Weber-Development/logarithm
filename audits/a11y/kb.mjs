import { readFileSync } from "node:fs";
import http from "node:http";
import { chromium } from "playwright-core";

const types = { html: "text/html", js: "text/javascript", css: "text/css" };
const server = http
  .createServer((req, res) => {
    const p = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
    try {
      res.writeHead(200, { "content-type": types[p.split(".").pop()] });
      res.end(readFileSync(`.${p}`));
    } catch {
      res.writeHead(404);
      res.end();
    }
  })
  .listen(4179);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await b.newPage({ viewport: { width: 1000, height: 900 } });
await page.goto("http://localhost:4179/");
await page.waitForSelector(".lg-root");
await page.waitForTimeout(400);
const seen = [];
for (let i = 0; i < 14; i++) {
  await page.keyboard.press("Tab");
  seen.push(
    await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return "body";
      const s = getComputedStyle(el);
      const visible =
        (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none";
      return `${el.tagName.toLowerCase()}:${el.type}:${el.getAttribute("aria-label") || el.name || ""}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""}${el.textContent ? ` '${el.textContent.trim().slice(0, 24)}'` : ""} focusVisible=${visible} expanded=${el.getAttribute("aria-expanded")}`;
    }),
  );
}
console.log(seen.join("\n"));
// open first expandable with keyboard
const t = await page.$("button[aria-expanded='false']");
if (t) {
  await t.focus();
  await page.keyboard.press("Enter");
  console.log("after Enter expanded=", await t.getAttribute("aria-expanded"));
  await page.keyboard.press("Space");
  console.log("after Space expanded=", await t.getAttribute("aria-expanded"));
}
// live region / loading status
console.log(
  "live regions:",
  await page.$$eval("[aria-live],[role=status],[role=alert]", (e) =>
    e.map((x) => x.getAttribute("role") || x.getAttribute("aria-live")),
  ),
);
console.log(
  "landmarks/roles:",
  await page.$$eval(".lg-root [role]", (e) => [...new Set(e.map((x) => x.getAttribute("role")))]),
);
await b.close();
server.close();
