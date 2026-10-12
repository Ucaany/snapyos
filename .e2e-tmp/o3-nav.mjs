import { chromium } from "playwright";
const BASE = "http://localhost:4321";
const b = await chromium.launch({ headless: false });
const ctx = await b.newContext({ storageState: "/tmp/audit/state/owner.json" });
const p = await ctx.newPage();
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto(BASE + "/dashboard/metrics", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1200);
// sidebar active state for Metrik
const active = await p.locator("a[aria-current=page]").allInnerTexts();
console.log("active nav items:", JSON.stringify(active.map((s) => s.trim())));
const metrikLink = p.locator("a", { hasText: "Metrik" }).first();
console.log("Metrik aria-current:", await metrikLink.getAttribute("aria-current"));
// topbar storage indicator present
console.log("topbar storage:", await p.locator("text=/MB \\/|GB \\//").count());
// check sidebar does not overlap content
const ov = await p.evaluate(() => {
  const side = document.querySelector("aside, nav[aria-label]");
  const main = document.querySelector("main");
  if (!side || !main) return "n/a";
  const s = side.getBoundingClientRect(), m = main.getBoundingClientRect();
  const ox = Math.min(s.right, m.right) - Math.max(s.left, m.left);
  return `overlapX=${Math.round(ox > 0 ? ox : 0)}`;
});
console.log("sidebar/main:", ov);
await b.close();
