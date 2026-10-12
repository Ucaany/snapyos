import { chromium } from "playwright";
const BASE = "http://localhost:4321";
const b = await chromium.launch({ headless: false });
const ctx = await b.newContext({ storageState: "/tmp/audit/state/owner.json" });
const p = await ctx.newPage();
await p.setViewportSize({ width: 1440, height: 900 });
const norm = (s) => (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

await p.goto(BASE + "/dashboard/metrics?from=2026-01-01&to=2026-12-31", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);

const rev = await p.locator("section[aria-label='Revenue'] [data-slot=metric-card]").allInnerTexts();
console.log("REVENUE CARDS:");
rev.forEach((t, i) => console.log(`  ${i}: "${norm(t)}"`));

const cells = await p.locator("[aria-label='Ringkasan metrik'] > div").allInnerTexts();
console.log("GRID CELLS:");
cells.forEach((t, i) => console.log(`  ${i}: "${norm(t)}"`));

const eyebrow = await p.locator("main header p.font-mono").first().innerText();
console.log("EYEBROW RAW:", JSON.stringify(eyebrow));

// Check label elements' computed text-transform
const labelTransforms = await p.evaluate(() => {
  const out = [];
  document.querySelectorAll("[data-slot=metric-card] p, [aria-label='Ringkasan metrik'] p").forEach((el) => {
    out.push(getComputedStyle(el).textTransform + " :: " + el.textContent.trim().slice(0, 30));
  });
  return out.slice(0, 8);
});
console.log("TEXT-TRANSFORM:", JSON.stringify(labelTransforms, null, 1));

// Per-booth table rows + check if booth without data shows
const rows = await p.locator("main table tbody tr").allInnerTexts();
console.log("BOOTH ROWS:", JSON.stringify(rows.map(norm)));

// count photoboxes in description
console.log("URL:", p.url());
await p.screenshot({ path: "/tmp/snapy-o3/verify-full.png", fullPage: true });
await b.close();
