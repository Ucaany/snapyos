import { test } from "playwright/test";
const BASE = "http://localhost:4321";
test.use({ storageState: "/tmp/snapy-e2e/owner-state.json" });

test("mobile tap targets + label", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const sizes = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>("main button, main a[role=button], main [role=button]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      const t = (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 22);
      out.push(`${t} = ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out;
  });
  console.log("MOBILE targets:\n" + sizes.join("\n"));
});

test("to-only merge guard", async ({ page }) => {
  const resp = await page.goto(`${BASE}/dashboard?to=2026-10-12`, { waitUntil: "networkidle" });
  console.log("to-only status:", resp?.status());
  const period = (await page.locator("main button span").first().textContent().catch(() => "")) ?? "";
  console.log("period label:", period.trim());
  const alert = await page.locator("[role=alert]").count();
  console.log("alert count:", alert);
});

test("calendar pick writes range + closes", async ({ page }) => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Pilih rentang tanggal/i }).click();
  await page.waitForTimeout(600);
  // pick two days in current month grid with buttons that are enabled
  const cells = page.locator("[role=gridcell] button:not([disabled])");
  const n = await cells.count();
  console.log("enabled day cells:", n);
  if (n >= 10) {
    await cells.nth(n - 6).click();
    await page.waitForTimeout(300);
    await cells.nth(n - 3).click();
    await page.waitForTimeout(1500);
    console.log("url after pick:", page.url().replace(BASE, ""));
    const open = await page.locator("[role=dialog]").isVisible().catch(() => false);
    console.log("popover still open:", open);
  }
});
