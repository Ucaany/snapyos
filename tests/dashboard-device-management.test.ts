import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard nav memuat Design Builder dan Manajemen Perangkat", async () => {
  const nav = await readFile("src/components/dashboard/nav.ts", "utf8");
  assert.match(nav, /Design Builder.*\/dashboard\/branding/);
  assert.match(nav, /Perangkat.*\/dashboard\/devices/);
  assert.doesNotMatch(nav, /dashboard\/prompt-copy|dashboard\/installers/);
});

test("route branding dirender sebagai Design Builder, perangkat tetap punya status", async () => {
  const page = await readFile("src/app/(dashboard)/dashboard/branding/page.tsx", "utf8");
  const devices = await readFile("src/components/dashboard/DeviceManagement.tsx", "utf8");
  const dialog = await readFile("src/components/dashboard/DeviceDialog.tsx", "utf8");
  assert.match(page, /DesignBuilder/);
  assert.doesNotMatch(page, /redirect\("\/dashboard\/devices"\)/);
  assert.match(devices, /app_version/);
  assert.match(dialog, /diagnostics/);
  assert.match(dialog, /last_heartbeat_at/);
  assert.match(dialog, /activation/);
  assert.match(dialog, /revoke/);
});

test("aksi branding lama tetap tidak diekspor", async () => {
  const branding = await readFile("src/server/branding-actions.ts", "utf8");
  const booth = await readFile("src/server/booth-actions.ts", "utf8");
  const catalog = await readFile("src/server/catalog-actions.ts", "utf8");
  const admin = await readFile("src/server/admin-actions.ts", "utf8");
  assert.doesNotMatch(branding, /saveBrandingKioskAction|uploadLogoAction|uploadKioskVideoAction/);
  assert.doesNotMatch(booth, /savePhotoboxBrandingAction/);
  assert.doesNotMatch(catalog, /saveTemplateBuilderAction/);
  assert.doesNotMatch(admin, /saveGlobalTemplateBuilderAction/);
});

test("Design Builder memakai aksi baru per-booth", async () => {
  const actions = await readFile("src/server/design-builder-actions.ts", "utf8");
  assert.match(actions, /saveBrandingAction/);
  assert.match(actions, /uploadBrandAssetAction/);
  assert.match(actions, /resetBoothBrandingAction/);
  assert.match(actions, /photobox:write/);
});
