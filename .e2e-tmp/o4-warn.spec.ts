import { test } from "playwright/test";
const BASE = "http://localhost:4321";
test.describe("O4 baseui warn", () => {
  test.use({ storageState: "/tmp/audit/state/owner.json" });
  test("capture warn", async ({ page }) => {
    const logs = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push({ type: m.type(), text: m.text() }); });
    await page.goto(`${BASE}/dashboard/finance`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    console.log("on load:", JSON.stringify(logs.map(l=>l.text.slice(0,160)), null, 1));
    logs.length = 0;
    // open create form
    await page.getByRole("button", { name: "Buka form pengeluaran baru" }).click();
    await page.waitForTimeout(1200);
    console.log("after open form:", JSON.stringify(logs.map(l=>l.text.slice(0,160)), null, 1));
    logs.length = 0;
    // click a preset (re-render)
    await page.getByRole("button", { name: "7 HARI", exact: true }).click();
    await page.waitForTimeout(2000);
    console.log("after preset:", JSON.stringify(logs.map(l=>l.text.slice(0,160)), null, 1));
  });
});
