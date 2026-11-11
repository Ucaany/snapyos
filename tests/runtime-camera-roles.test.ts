/**
 * Peran kamera runtime — sumber: runtime/camera/index.ts + runtime/config.ts.
 *
 * Yang dijaga: booth lama (satu kamera) tetap memakai instance yang SAMA untuk
 * stills dan preview, sedangkan booth dua kamera mendapat dua adapter berbeda.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createCameraFor, createCameraRoles } from "../runtime/camera/index.ts";
import { hasCamera } from "../runtime/camera/libcamera.ts";
import { loadConfig } from "../runtime/config.ts";
import { effectiveConfig } from "../runtime/settings/index.ts";

const TOKEN = "test-bridge-token-0123456789";

test("tanpa SNAPYOS_CAMERA_STREAM, preview memakai instance stills yang sama", () => {
  const config = loadConfig({
    PHOTOBOOTH_BRIDGE_TOKEN: TOKEN,
    SNAPYOS_CAMERA: "mock",
    SNAPYOS_ALLOW_MOCK: "1",
  });
  const roles = createCameraRoles(config);
  assert.equal(roles.stream, roles.stills, "satu kamera tidak boleh membuat dua adapter");
});

test("dua kamera: stills v4l2 + stream pyav menghasilkan adapter berbeda", () => {
  const config = loadConfig({
    PHOTOBOOTH_BRIDGE_TOKEN: TOKEN,
    SNAPYOS_CAMERA: "v4l2",
    SNAPYOS_CAMERA_STREAM: "pyav",
  });
  const roles = createCameraRoles(config);
  assert.equal(roles.stills.kind, "v4l2");
  assert.equal(roles.stream.kind, "pyav");
  assert.notEqual(roles.stream, roles.stills);
});

test("dua peran pada perangkat yang sama tetap berbagi adapter", () => {
  const config = loadConfig({
    PHOTOBOOTH_BRIDGE_TOKEN: TOKEN,
    SNAPYOS_CAMERA: "v4l2",
    SNAPYOS_CAMERA_STREAM: "v4l2",
    V4L2_DEVICE: "/dev/video0",
    V4L2_DEVICE_STREAM: "/dev/video0",
  });
  const roles = createCameraRoles(config);
  assert.equal(roles.stream, roles.stills, "kamera yang sama tidak boleh diakses dua lock");
});

test("dua perangkat v4l2 berbeda memakai adapter terpisah", () => {
  const config = loadConfig({
    PHOTOBOOTH_BRIDGE_TOKEN: TOKEN,
    SNAPYOS_CAMERA: "v4l2",
    SNAPYOS_CAMERA_STREAM: "v4l2",
    V4L2_DEVICE: "/dev/video0",
    V4L2_DEVICE_STREAM: "/dev/video2",
  });
  const roles = createCameraRoles(config);
  assert.notEqual(roles.stream, roles.stills);
});

test("default platform tidak berubah: gphoto2 untuk stills", () => {
  const config = loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: TOKEN, SNAPYOS_CAMERA: "gphoto2" });
  assert.equal(config.camera, "gphoto2");
  assert.equal(config.cameraStream, null);
  assert.equal(createCameraFor(config, "gphoto2", "stills").kind, "gphoto2");
});

test("adapter libcamera/v4l2/pyav bisa dipilih", () => {
  const config = loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: TOKEN });
  assert.equal(createCameraFor(config, "libcamera", "stills").kind, "libcamera");
  assert.equal(createCameraFor(config, "v4l2", "stills").kind, "v4l2");
  assert.equal(createCameraFor(config, "pyav", "stills").kind, "pyav");
});

test("SNAPYOS_CAMERA_STREAM tidak sah ditolak saat start", () => {
  assert.throws(
    () =>
      loadConfig({
        PHOTOBOOTH_BRIDGE_TOKEN: TOKEN,
        SNAPYOS_CAMERA: "gphoto2",
        SNAPYOS_CAMERA_STREAM: "canon",
      }),
    /SNAPYOS_CAMERA_STREAM/
  );
});

test("effectiveConfig: setelan 'bridge' membiarkan env memilih merek adapter", () => {
  const config = loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: TOKEN, SNAPYOS_CAMERA: "libcamera" });
  const effective = effectiveConfig(config, { camera_settings: { provider: "bridge" } });
  assert.equal(effective.camera, "libcamera");
});

test("effectiveConfig: adapter eksplisit dari teknisi menang atas env", () => {
  const config = loadConfig({ PHOTOBOOTH_BRIDGE_TOKEN: TOKEN, SNAPYOS_CAMERA: "gphoto2" });
  const effective = effectiveConfig(config, { camera_settings: { provider: "v4l2" } });
  assert.equal(effective.camera, "v4l2");
});

test("effectiveConfig: mock tidak pernah ditimpa setelan tersimpan", () => {
  const config = loadConfig({
    PHOTOBOOTH_BRIDGE_TOKEN: TOKEN,
    SNAPYOS_CAMERA: "mock",
    SNAPYOS_ALLOW_MOCK: "1",
  });
  const effective = effectiveConfig(config, { camera_settings: { provider: "gphoto2" } });
  assert.equal(effective.camera, "mock");
});

test("hasCamera: membedakan tidak-ada-kamera dari daftar kamera", () => {
  assert.equal(hasCamera("No cameras available!"), false);
  assert.equal(hasCamera("Available cameras\n-----------------\n0 : imx708 [4608x2592]"), true);
  assert.equal(hasCamera("0 : imx708 [4608x2592] (/base/soc/i2c0mux/i2c@1/imx708@1a)"), true);
  assert.equal(hasCamera(""), false);
});
