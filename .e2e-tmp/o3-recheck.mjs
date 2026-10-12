import { chromium } from "playwright";
const BASE = "http://localhost:4321";
const b = await chromium.launch({ headless: false });
const ctx = await b.newContext({ storageState: "/tmp/audit/state/owner.json" });
const p = await ctx.newPage();
const norm = (s) => (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
const findings = [];
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto(BASE + "/dashboard/metrics", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1200);

// Corrected checks
const eyebrow = norm(await p.locator("main header p.font-mono").first().innerText());
if (!/^\/\/\/ metrik: /.test(eyebrow)) findings.push("eyebrow format unexpected: " + eyebrow);
const rev = (await p.locator("section[aria-label='Revenue'] [data-slot=metric-card]").allInnerTexts()).map(norm);
for (const need of ["pendapatan net", "gross", "diskon", "pertumbuhan"]) {
  if (!rev.some((t) => t.startsWith(need))) findings.push("missing revenue card: " + need);
}
const cells = (await p.locator("[aria-label='Ringkasan metrik'] > div").allInnerTexts()).map(norm);
const needLabels = ["sesi foto","sesi selesai","sesi batal","total retake","durasi rata-rata","pelanggan total","pelanggan baru","pelanggan kembali","tx gagal"];
for (const lbl of needLabels) if (!cells.some((t) => t.startsWith(lbl))) findings.push("missing grid cell: " + lbl);

// Full-page text scan for pending/cancelled/refunded
const body = norm(await p.locator("main").innerText());
console.log("PAGE has 'pending':", /pending/.test(body));
console.log("PAGE has 'batal':", /batal/.test(body));
console.log("PAGE has 'refund':", /refund/.test(body));
console.log("PAGE has 'tx total/total transaksi':", /total transaksi|tx total/.test(body));

console.log("\nCORRECTED false-positive recheck findings:", findings.length ? findings : "NONE (all prior flagged were casing false-positives)");
await b.close();
