import { chromium } from "/home/claude/ledger/node_modules/playwright-core/index.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const themes = {
  light: `--surface-0:#f4f4f2;--surface-1:#ffffff;--page:#fafaf8;--border:#e7e7e4;--border-strong:#d6d6d2;--border-stronger:#b9b9b4;--text-primary:#141413;--text-secondary:#5c5b55;--bg-success:#e8f6f3;--text-success:#0a7c72;--border-success:#a8ded4;`,
  dark: `--surface-0:#232323;--surface-1:#1b1b1b;--page:#0d0d0d;--border:#2c2c2c;--border-strong:#3a3a3a;--border-stronger:#555;--text-primary:#e7e7e7;--text-secondary:#a9a9a9;--bg-success:#18302c;--text-success:#5bbfb1;--border-success:#2f5c55;`,
};
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome" });
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 760, height: 800 } });
for (const name of ["overview", "detail"]) for (const [mode, vars] of Object.entries(themes)) {
  const html = `<!doctype html><html><head><link rel="stylesheet" href="file:///tmp/arch/node_modules/@tabler/icons-webfont/dist/tabler-icons.min.css"><style>
  :root{${vars}--font-sans:Inter,"Segoe UI",system-ui,sans-serif;--font-mono:ui-monospace,Menlo,monospace}
  body{margin:0;background:var(--page)} #w{width:700px;padding:26px 30px 22px}
  .cap{font:500 15px var(--font-sans);color:var(--text-primary);margin:0 0 12px;display:flex;gap:8px;align-items:center}
  .cap span{font-weight:400;color:var(--text-secondary);font-size:13px}</style></head>
  <body><div id="w"><div class="cap">Ledger <span>${name === "overview" ? "· architecture overview" : "· inside the server and the life of a trade"}</span></div>${readFileSync(`/tmp/arch/${name}.html`, "utf8")}</div></body></html>`;
  writeFileSync("/tmp/arch/page.html", html);
  await page.goto("file:///tmp/arch/page.html", { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "*{animation:none!important}" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#w").screenshot({ path: `/home/claude/ledger/docs/architecture-${name}-${mode}.png` });
}
await browser.close();
