import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAMERA_CONFIG_KEYS,
  isAllowedCameraConfigKey,
  parseGphoto2Cameras,
  parseGphoto2Config,
  parseGphoto2Model,
  validateCameraConfigValue,
} from "./gphoto2.ts";

test("parseGphoto2Cameras memisahkan model dan port", () => {
  const output = [
    "Model                          Port",
    "----------------------------------------------------------",
    "Canon EOS 1300D                usb:001,004",
  ].join("\n");
  assert.deepEqual(parseGphoto2Cameras(output), [
    { id: "usb:001,004", label: "Canon EOS 1300D (usb:001,004)", model: "Canon EOS 1300D", port: "usb:001,004" },
  ]);
});

test("parseGphoto2Model membaca baris Model", () => {
  assert.equal(parseGphoto2Model("Manufacturer: Canon\nModel: EOS 1300D\n"), "EOS 1300D");
  assert.equal(parseGphoto2Model("no summary"), undefined);
});

test("parseGphoto2Config membaca label/type/current/choice", () => {
  const entry = parseGphoto2Config(
    "iso",
    [
      "Label: ISO Speed",
      "Readonly: 0",
      "Type: RADIO",
      "Current: 800",
      "Choice: 0 100",
      "Choice: 1 200",
      "Choice: 2 800",
      "END",
    ].join("\n")
  );
  assert.deepEqual(entry, {
    key: "iso",
    label: "ISO Speed",
    readonly: false,
    type: "RADIO",
    current: "800",
    choices: ["100", "200", "800"],
  });
});

test("validateCameraConfigValue menolak readonly dan choice asing", () => {
  const entry = {
    key: "iso",
    label: "ISO",
    readonly: false,
    type: "RADIO",
    current: "800",
    choices: ["100", "200"],
  };
  assert.equal(validateCameraConfigValue(entry, "100").ok, true);
  assert.equal(validateCameraConfigValue(entry, "400").ok, false);
  assert.equal(validateCameraConfigValue({ ...entry, readonly: true }, "100").ok, false);
});

test("allowlist config hanya key yang dikenal", () => {
  assert.equal(isAllowedCameraConfigKey("iso"), true);
  assert.equal(isAllowedCameraConfigKey("bulb"), false);
  assert.ok(CAMERA_CONFIG_KEYS.includes("capturetarget"));
});
