import { test } from "playwright/test";
import { writeFile } from "node:fs/promises";

const BASE = "http://localhost:4321";
const OUT = "/tmp/snapy-e2e2";

test.describe(() => {
  test.use({ storageState: "/tmp/snapy-e2e/owner-state.json" });
  test("vouchers behavior deep dive", async ({ page }) => {
  test.setTimeout(120000);
  const con: string[] = [];
  page.on("console", (m) => con.push(`[${m.type()}] ${m.text().slice(0, 400)}`));
  page.on("pageerror", (e) => con.push(`[pageerror] ${(e.stack || e.message).slice(0, 600)}`));

  const resp = await page.goto(`${BASE}/dashboard/vouchers`, { waitUntil: "domcontentloaded", timeout: 30000 });
  console.log("status", resp?.status());
  await page.waitForTimeout(8000);
  const body = (await page.textContent("body")) || "";
  console.log("URL", page.url());
  console.log("TITLE", await page.title());
  console.log("H1", (await page.locator("h1").first().textContent().catch(() => "none")));
  console.log("HAS upgrade text:", /upgrade|tidak tersedia|tidak dapat diambil|gagal memuat/i.test(body));
  console.log("BODY SNIPPET:", body.replace(/\s+/g, " ").slice(0, 600));
  await page.screenshot({ path: `${OUT}/vouchers-deep.png`, fullPage: true });
  await writeFile(`${OUT}/vouchers-console.txt`, con.join("\n"));
  console.log("CONSOLE:", con.join("\n").slice(0, 1500));
});
});
