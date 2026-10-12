import { test } from "playwright/test";
const BASE = "http://localhost:4321";
test.describe("O4 layout geometry", () => {
  test.use({ storageState: "/tmp/audit/state/owner.json" });
  test("geometry", async ({ page }) => {
    await page.goto(`${BASE}/dashboard/finance`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1800);
    const info = await page.evaluate(() => {
      const out = {};
      const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
      out.header = r("main header");
      out.h1 = r("main h1");
      out.eyebrow = r("main p.font-mono");
      out.daterange = r("main button[aria-label='Pilih rentang tanggal']")?.x ? document.querySelector("main button[aria-label='Pilih rentang tanggal']")?.closest("div")?.getBoundingClientRect() : null;
      out.metricSection = r("section[aria-label='Ringkasan finance']");
      out.cards = Array.from(document.querySelectorAll("section[aria-label='Ringkasan finance'] [data-slot=metric-card]")).map(el => { const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y) }; });
      // any element wider than viewport
      const vw = document.documentElement.clientWidth;
      out.vw = vw;
      const over = [];
      document.querySelectorAll("main *").forEach(el => { const b = el.getBoundingClientRect(); if (b.width > vw + 1) over.push(`${el.tagName}.${String(el.className).slice(0,30)} w=${Math.round(b.width)}`); });
      out.overflowWidth = over.slice(0, 6);
      // header vs date filter same row?
      const hdr = document.querySelector("main header");
      const dr = document.querySelector("main button[aria-label='Pilih rentang tanggal']");
      if (hdr && dr) {
        const hb = hdr.getBoundingClientRect(); const db = dr.getBoundingClientRect();
        out.sameRow = Math.abs(hb.top - db.top) < hb.height;
        out.headerH = Math.round(hb.height);
      }
      // metric card label/value font sizes
      const card = document.querySelector("[data-slot=metric-card]");
      if (card) {
        const ps = card.querySelectorAll("p");
        out.cardFonts = Array.from(ps).map(p => `${getComputedStyle(p).fontSize}/${getComputedStyle(p).fontFamily.split(",")[0]}`);
      }
      return out;
    });
    console.log(JSON.stringify(info, null, 1));
  });
});
