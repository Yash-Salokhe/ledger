// Visual check: renders pages of a running build in headless Chrome and saves PNGs.
// Usage: node scripts/screenshots.mjs <curl-cookie-jar> "name|/path|width|height|light|dark[|anon]" …
// CHROME_PATH overrides the browser binary (default /usr/bin/google-chrome).
import { chromium } from "playwright-core";
import fs from "node:fs";
const [,, jarPath, ...targets] = process.argv; // targets: name|path|w|h|theme
const cookies = fs.readFileSync(jarPath, "utf8").split("\n").filter((l) => l.includes("\t")).map((l) => {
  const p = l.replace(/^#HttpOnly_/, "").split("\t");
  return { name: p[5], value: p[6], domain: "localhost", path: p[2], httpOnly: l.startsWith("#HttpOnly_") };
});
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
for (const t of targets) {
  const [name, path, w, h, theme, auth] = t.split("|");
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, colorScheme: theme });
  if (auth !== "anon") await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.addInitScript((th) => { try { localStorage.setItem("ledger-theme", th); } catch {} }, theme);
  await page.goto("http://localhost:3000" + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(2600); // let entrance animations finish
  await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true });
  console.log(name, page.url().replace("http://localhost:3000", ""), errors.length ? "ERRORS: " + errors.slice(0, 3).join(" | ") : "ok");
  await ctx.close();
}
await browser.close();
