import { expect, test } from "@playwright/test";

test("landing page renders hero", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Photobox bisnis Anda/i })
  ).toBeVisible();
});

test("login page renders auth form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Masuk ke SnapyOS/i })).toBeVisible();
});
