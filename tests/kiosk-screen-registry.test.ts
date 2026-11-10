import test from "node:test";
import assert from "node:assert/strict";
import {
  KIOSK_SCREEN_IDS,
  normalizeCameraCalibration,
  normalizeKioskScreenId,
  resolveKioskOrientation,
  resolveKioskScreenConfig,
} from "../src/lib/kiosk-screen-registry.ts";

test("registry covers customer screens and excludes technical boot screens", () => {
  assert.deepEqual(KIOSK_SCREEN_IDS, [
    "welcome",
    "guide",
    "package",
    "payment",
    "template",
    "capture",
    "review",
    "editor",
    "printing",
    "result",
    "offline",
    "error",
    "maintenance",
  ]);
  assert.equal(normalizeKioskScreenId("activation"), null);
  assert.equal(normalizeKioskScreenId("setup"), null);
  assert.equal(normalizeKioskScreenId("edit"), "editor");
});

test("screen config resolves orientation, safe area, font scale, and camera calibration", () => {
  const config = resolveKioskScreenConfig({
    screen: "review",
    kiosk: { font_scale: 1.2, padding: 32 },
    orientation: "portrait",
    camera: { rotation_degrees: 91, zoom: 7 },
  });
  assert.equal(config.orientation, "portrait");
  assert.equal(config.layout, "review");
  assert.equal(config.fontScale, 1.2);
  assert.equal(config.safeArea.top, "env(safe-area-inset-top, 0px)");
  assert.deepEqual(config.cameraCalibration, { rotationDegrees: 90, zoom: 5 });
  assert.equal(config.minTouchTarget, 44);
});

test("orientation falls back to viewport shape", () => {
  assert.equal(resolveKioskOrientation(undefined, { width: 600, height: 900 }), "portrait");
  assert.equal(resolveKioskOrientation(undefined, { width: 1200, height: 800 }), "landscape");
});

test("camera calibration rejects non-finite values and snaps rotation", () => {
  assert.deepEqual(normalizeCameraCalibration({ rotation_degrees: 47, zoom: Number.NaN }), {
    rotationDegrees: 90,
    zoom: 1,
  });
});
