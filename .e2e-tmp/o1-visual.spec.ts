import { test } from "playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:4321";
const OUT = "/tmp/snapy-o1";

test.describe("O1 visual evidence", () => {
  test.use({ storageState: "/tmp/snapy-e2e/owner-state.json" });

  test("capture error boundary for invalid range", async ({ page }) => {
    await mkdir(OUT, { recursive: true });
    await page.goto(`${BASE}/dashboard?from=2026-10-10&to=2026-10-01`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/error-boundary-invalid-range.png`, fullPage: true });
    const txt = (await page.locator("[role=alert]").first().textContent().catch(() => "")) ?? "";
    console.log("ALERT TEXT:", txt.replace(/\s+/g, " ").trim().slice(0, 300));
  });

  test("capture dashboard empty state via excluding range", async ({ page }) => {
    await mkdir(OUT, { recursive: true });
    // a past range with no data (before seed window) → empty state
    await page.goto(`${BASE}/dashboard?from=2025-01-01&to=2025-01-07`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/empty-range.png`, fullPage: true });
    const empty = await page.getByText("Belum ada pendapatan", { exact: true }).count();
    const emptyTx = await page.getByText("Belum ada transaksi", { exact: true }).count();
    console.log(`EMPTY chart=${empty} tx=${emptyTx}`);
  });
});
