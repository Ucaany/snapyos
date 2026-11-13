import { expect, test } from "@playwright/test";

/**
 * Runtime authorization checks yang tidak butuh kredensial.
 * Bukti bahwa route terlindungi di server, bukan hanya disembunyikan di UI.
 */

const protectedRoutes = ["/dashboard", "/dashboard/staff", "/admin", "/staff", "/pos"];

for (const route of protectedRoutes) {
  test(`unauthenticated ${route} redirects to login`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /Masuk ke SnapyOS/i })).toBeVisible();
  });
}

test("API bisnis menolak request tanpa sesi", async ({ request }) => {
  const res = await request.get("/api/v1/me/businesses");
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error.code).toBe("UNAUTHORIZED");
});

test("halaman lupa password tersedia", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: /Lupa password/i })).toBeVisible();
  await expect(page.getByLabel(/Email akun/i)).toBeVisible();
});

test("token reset tidak valid ditolak tanpa form", async ({ page }) => {
  await page.goto("/reset-password/token-palsu");
  await expect(page.getByText(/Tautan reset tidak valid/i)).toBeVisible();
  await expect(page.getByLabel(/Password baru/i)).toHaveCount(0);
});

test("token undangan tidak valid ditolak", async ({ page }) => {
  await page.goto("/invite/token-palsu");
  await expect(page.getByRole("heading", { name: /Undangan tidak valid/i })).toBeVisible();
});

test("kiosk slug tidak dikenal menghasilkan 404", async ({ page }) => {
  const res = await page.goto("/p/tidak-ada/tidak-ada");
  expect(res?.status()).toBe(404);
});
