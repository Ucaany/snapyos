import { chromium } from "playwright";
const BASE = "http://localhost:4321";
const b = await chromium.launch({ headless: false });
const ctx = await b.newContext({ storageState: "/tmp/audit/state/owner.json" });
const p = await ctx.newPage();
const norm = (s) => (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

for (const [w, h] of [[390, 844], [768, 1024], [1440, 900]]) {
  await p.setViewportSize({ width: w, height: h });
  await p.goto(BASE + "/dashboard/metrics", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1200);
  const info = await p.evaluate(() => {
    const out = {};
    const revSection = document.querySelector("section[aria-label='Revenue']");
    if (revSection) {
      const cards = [...revSection.querySelectorAll("[data-slot=metric-card]")];
      out.revCards = cards.map((c) => {
        const r = c.getBoundingClientRect();
        return `w=${Math.round(r.width)} h=${Math.round(r.height)}`;
      });
    }
    const grid = document.querySelector("[aria-label='Ringkasan metrik']");
    if (grid) {
      const g = grid.getBoundingClientRect();
      out.grid = `w=${Math.round(g.width)}; cols=${getComputedStyle(grid).gridTemplateColumns}`;
      const cells = [...grid.querySelectorAll(":scope > div")];
      out.cellH = cells.map((c) => Math.round(c.getBoundingClientRect().height)).join(",");
    }
    // header height & filter position
    const header = document.querySelector("main header");
    if (header) out.headerH = Math.round(header.getBoundingClientRect().height);
    // check filter wraps below title
    const filter = document.querySelector("button[aria-label='Pilih rentang tanggal']");
    if (filter) {
      const fr = filter.getBoundingClientRect();
      out.filterTop = Math.round(fr.top);
    }
    // any element wider than viewport
    out.docW = document.documentElement.scrollWidth;
    out.clientW = document.documentElement.clientWidth;
    return out;
  });
  console.log(`\n=== @${w}x${h} ===`);
  console.log(JSON.stringify(info, null, 1));
}

// description copy check: does it claim ALL numbers are from paid tx?
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto(BASE + "/dashboard/metrics", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1000);
const desc = norm(await p.locator("main header p.max-w-\\[65ch\\]").innerText().catch(() => ""));
console.log("\nDESC:", JSON.stringify(desc));
await b.close();
