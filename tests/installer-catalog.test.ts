import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { isInstallerCompatible, isPublishedInstaller } from "../src/lib/installer-compatibility.ts";
import { validateInstallerFile } from "../src/lib/upload-validation.ts";
import { installerMetadataSchema } from "../src/lib/validators.ts";

const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const file = { name: "snapyos.zip", type: "application/zip", size: bytes.byteLength };

test("installer metadata validates channel, Windows, architecture", () => {
  assert.equal(installerMetadataSchema.safeParse({ version: "1.2.3", channel: "stable", min_windows_version: "10", architecture: "x64" }).success, true);
  assert.equal(installerMetadataSchema.safeParse({ version: "1.2", channel: "stable", min_windows_version: "10", architecture: "x64" }).success, false);
});

test("installer upload validates extension and magic bytes", () => {
  assert.deepEqual(validateInstallerFile(file, bytes), { ok: true, ext: "zip" });
  assert.equal(validateInstallerFile({ ...file, name: "snapyos.msi", type: "application/x-msi" }, bytes).ok, false);
});

test("compatibility accepts Windows upgrades and universal artifacts", () => {
  assert.equal(isInstallerCompatible({ min_windows_version: "10", architecture: "x64", windows: "11", requestedArchitecture: "x64" }), true);
  assert.equal(isInstallerCompatible({ min_windows_version: "11", architecture: "x64", windows: "10", requestedArchitecture: "x64" }), false);
  assert.equal(isInstallerCompatible({ min_windows_version: "10", architecture: "universal", windows: "10", requestedArchitecture: "arm64" }), true);
});

test("published owner predicate excludes draft, inactive, deprecated", () => {
  assert.equal(isPublishedInstaller({ is_active: true, is_deprecated: false, published_at: "2026-11-05T00:00:00Z" }), true);
  assert.equal(isPublishedInstaller({ is_active: true, is_deprecated: true, published_at: "2026-11-05T00:00:00Z" }), false);
  assert.equal(isPublishedInstaller({ is_active: true, is_deprecated: false, published_at: null }), false);
});

test("routes keep authorization wrappers and tenant predicates", async () => {
  const admin = await readFile("src/app/api/v1/admin/installers/route.ts", "utf8");
  const owner = await readFile("src/server/installers.ts", "utf8");
  assert.match(admin, /adminRawRoute/);
  assert.match(admin, /METHOD_NOT_ALLOWED/);
  const itemRoute = await readFile("src/app/api/v1/admin/installers/[id]/route.ts", "utf8");
  assert.match(itemRoute, /adminRawRoute/);
  assert.match(itemRoute, /METHOD_NOT_ALLOWED/);
  assert.match(owner, /getMembership/);
  assert.match(owner, /\.eq\("business_id", businessId\)/);
  assert.match(owner, /membership\.role !== "owner"/);
  assert.doesNotMatch(owner, /fetch\(/);
});
