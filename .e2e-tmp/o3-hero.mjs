import { chromium } from "playwright";
const BASE = "http://localhost:4321";
const b = await chromium.launch({ headless: false });
const ctx = await b.newContext({ storageState: "/tmp/audit/state/owner.json" });
const p = await ctx.newPage();
await p.setViewportSize({ width: 768, height: 1024 });
await p.goto(BASE + "/dashboard/metrics", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1200);
const detail = await p.evaluate(() => {
  const hero = document.querySelector("section[aria-label='Revenue'] [data-slot=metric-card]");
  const hr = hero.getBoundingClientRect();
  const kids = [...hero.children].map((c) => {
    const r = c.getBoundingClientRect();
    return `${c.tagName}.${c.className.slice(0, 20)} top=${Math.round(r.top - hr.top)} h=${Math.round(r.height)}`;
  });
  // content bottom
  let contentBottom = 0;
  [...hero.querySelectorAll("*")].forEach((el) => {
    const r = el.getBoundingClientRect();
    contentBottom = Math.max(contentBottom, r.bottom - hr.top);
  });
  return {
    heroH: Math.round(hr.height),
    heroW: Math.round(hr.width),
    contentBottom: Math.round(contentBottom),
    emptySpace: Math.round(hr.height - contentBottom),
    kids,
    justify: getComputedStyle(hero).justifyContent,
  };
});
console.log(JSON.stringify(detail, null, 1));
await p.screenshot({ path: "/tmp/snapy-o3/O3-tablet-768-hero.png", fullPage: true });
await b.close();
