import assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigError, loadConfig } from "../runtime/config.ts";

const TOKEN = "test-bridge-token-0123456789";

test("token bridge kurang dari 16 karakter ditolak", () => {
  assert.throws(() => loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: "pendek" }), ConfigError);
  assert.throws(() => loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: "" }), ConfigError);
});

test("mock di produksi ditolak tanpa SNAPYOS_ALLOW_MOCK=1", () => {
  const base = {
    PHOTOBOOTH_BRIDGE_TOKEN: TOKEN,
    SNAPYOS_CAMERA: "mock",
    NODE_ENV: "production",
  };
  assert.throws(() => loadConfig(base), ConfigError);
  assert.doesNotThrow(() => loadConfig({ ...base, SNAPYOS_ALLOW_MOCK: "1" }));
  assert.doesNotThrow(() => loadConfig({ ...base, NODE_ENV: "development" }));
});

test("adapter tak dikenal ditolak, bukan diam-diam jatuh ke default", () => {
  assert.throws(
    () => loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: TOKEN, SNAPYOS_CAMERA: "canon" }),
    /SNAPYOS_CAMERA/
  );
  assert.throws(
    () => loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: TOKEN, SNAPYOS_PRINTER: "escpos" }),
    /SNAPYOS_PRINTER/
  );
});

test("port 0 dan port di luar rentang ditolak", () => {
  assert.throws(() => loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: TOKEN, PHOTOBOOTH_BRIDGE_PORT: "0" }));
  assert.throws(() =>
    loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: TOKEN, PHOTOBOOTH_BRIDGE_PORT: "70000" })
  );
  assert.equal(
    loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: TOKEN, PHOTOBOOTH_BRIDGE_PORT: "18000" }).port,
    18000
  );
});

test("timeout capture dijepit ke 5-120 detik", () => {
  assert.equal(loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: TOKEN, GPHOTO2_TIMEOUT_MS: "1" }).timeoutMs, 5_000);
  assert.equal(
    loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: TOKEN, GPHOTO2_TIMEOUT_MS: "999999" }).timeoutMs,
    120_000
  );
});

test("token tidak pernah disimpan mentah di config", () => {
  const config = loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: TOKEN });
  assert.ok(Buffer.isBuffer(config.tokenDigest));
  assert.ok(!JSON.stringify(config).includes(TOKEN));
});

test("data dir tidak pernah menunjuk ke folder kode", () => {
  const config = loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: TOKEN });
  assert.ok(!config.dataDir.startsWith(process.cwd()));
  assert.equal(loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: TOKEN, SNAPYOS_DATA_DIR: "/tmp/x" }).dataDir, "/tmp/x");
});
