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

test("halaman hardware booth: action ter-gate, audit, invalidate, dan panel uji cetak", async () => {
  const actions = await readFile("src/server/hardware-actions.ts", "utf8");
  assert.match(actions, /requireEffectiveSubscription\(ctx\.businessId, "write"\)/);
  assert.match(actions, /can\(ctx\.role, "photobox:write"\)/);
  assert.match(actions, /photoboxHardwareSchema\.parse/);
  assert.match(actions, /printTestReportSchema\.parse/);
  assert.match(actions, /insertAudit\(/);
  assert.match(actions, /invalidatePublicConfig\(ctx\.businessId\)/);
  assert.match(actions, /export async function reportPrintTestAction/);
  assert.match(actions, /device_status: \{ \.\.\.status, printer \}/);

  const page = await readFile(
    "src/app/(dashboard)/dashboard/photoboxes/[id]/hardware/page.tsx",
    "utf8"
  );
  assert.match(page, /PhotoboxHardwarePanel/);
  assert.match(page, /getPhotobox\(/);

  const panel = await readFile("src/components/dashboard/photobox-hardware.tsx", "utf8");
  for (const name of [
    "PhotoPathEditor",
    "ThermalPhotoEditor",
    "ReceiptPathEditor",
    "CameraSetupEditor",
    "HardwareDetectButton",
  ]) {
    assert.match(panel, new RegExp(`export function ${name}`), `${name} hilang`);
  }
  assert.match(panel, /PrintTestPanel/);
  assert.match(panel, /reportPrintTestAction/);
  assert.match(panel, /Deteksi ulang/);
  // Bridge mati = status netral, bukan error merah.
  assert.match(panel, /Bridge lokal tidak menjawab/);
  // Status bridge mati memakai NEUTRAL, bukan kelas error merah.
  assert.match(panel, /state === "unreachable" \? NEUTRAL/);
});

test("SetupWizard menyimpan hasil uji cetak lewat onReport, bukan no-op", async () => {
  const wizard = await readFile("src/components/kiosk/SetupWizard.tsx", "utf8");
  assert.doesNotMatch(wizard, /onReport=\{\(\) => undefined\}/);
  assert.match(wizard, /onReport=\{async \(result\) => \{/);
  assert.match(wizard, /printer: \{[\s\S]*confirmed: result\.confirmed/);
});

test("PhotoboxesTable menautkan halaman hardware per booth", async () => {
  const table = await readFile("src/components/dashboard/PhotoboxesTable.tsx", "utf8");
  assert.match(table, /\/dashboard\/photoboxes\/\$\{box\.id\}\/hardware/);
});

test("panel PIN booth tetap boleh menulis grup printer yang sama (override lokal)", async () => {
  const payload = await readFile("src/lib/booth-settings-payload.ts", "utf8");
  assert.match(payload, /photo: mirrorPhotoGroup\(draft\.print\.photo, draft\.print\)/);
  assert.match(payload, /thermal: draft\.print\.thermal/);
  assert.match(payload, /receipt: draft\.print\.receipt/);
  const contract = await readFile("src/lib/device-settings-contract.ts", "utf8");
  assert.match(contract, /print_settings: \["photo", "thermal", "receipt"\]/);
});
