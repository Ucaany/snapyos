import { chromium } from "playwright";
const BASE = "http://localhost:4321";
for (const name of ["owner","admin","staff"]) {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ storageState: `/tmp/audit/state/${name}.json` });
  const p = await ctx.newPage();
  const resp = await p.goto(BASE + "/dashboard/finance", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1500);
  const finalUrl = p.url();
  const body = (await p.locator("body").innerText().catch(()=>"")).slice(0,160).replace(/\n+/g," | ");
  console.log(`[${name}] status=${resp?.status()} url=${finalUrl}`);
  console.log(`    body: ${body}`);
  await b.close();
}
