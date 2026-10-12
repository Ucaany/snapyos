import { test } from "playwright/test";
const BASE = "http://localhost:4321";
test.use({ storageState: "/tmp/snapy-e2e/owner-state.json" });

test("inspect to-only alert + from-only", async ({ page }) => {
  await page.goto(`${BASE}/dashboard?to=2026-10-12`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const alert = (await page.locator("[role=alert]").first().textContent().catch(() => "")) ?? "";
  console.log("TO-ONLY alert text:", alert.replace(/\s+/g," ").trim().slice(0,200));
  const alertVisible = await page.locator("[role=alert]").first().isVisible().catch(()=>false);
  console.log("TO-ONLY alert visible:", alertVisible);

  // from-only (later than today)
  const r2 = await page.goto(`${BASE}/dashboard?from=2026-12-01`, { waitUntil: "networkidle" });
  console.log("FROM-FUTURE-only status:", r2?.status());
  await page.waitForTimeout(800);
  console.log("FROM-FUTURE alert:", ((await page.locator("[role=alert]").first().textContent().catch(()=>""))||"").replace(/\s+/g," ").trim().slice(0,160));

  // from only in past, to defaults today -> valid
  const r3 = await page.goto(`${BASE}/dashboard?from=2026-09-01`, { waitUntil: "networkidle" });
  console.log("FROM-PAST-only status:", r3?.status());
});
