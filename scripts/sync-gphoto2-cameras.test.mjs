import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boothSupportFromAbilities,
  buildCatalog,
  cameraTypeOf,
  driverStatusFromComment,
  normalizeModel,
  parseCameraListHtml,
  validateSnapshot,
} from "./sync-gphoto2-cameras.mjs";

test("parseCameraListHtml membaca abilities, status, dan media player", () => {
  const html = `<table>
<tr><th>Camera Model</th><th>Additional Abilities</th><th>Comments</th></tr>
<tr><td>Canon EOS R5</td><td>Image Capture, Liveview, Configuration</td><td>&nbsp;</td></tr>
<tr><td>Aiptek PenCam</td><td>Image Capture</td><td>Testing (Beta) &nbsp;</td></tr>
<tr><td>Old Cam</td><td>&nbsp;</td><td>Deprecated &amp; unsupported</td></tr>
</table>
<table><tr><th>Media Player Model</th></tr><tr><td>A&amp;K AK120II</td></tr></table>`;
  const parsed = parseCameraListHtml(html);
  assert.deepEqual(
    parsed.rows.map((row) => row.model),
    ["Canon EOS R5", "Aiptek PenCam", "Old Cam", "A&K AK120II"]
  );
  assert.equal(parsed.rows[0].abilitiesText, "Image Capture, Liveview, Configuration");
  assert.equal(parsed.rows[2].comment, "Deprecated & unsupported");
  assert.equal(parsed.rows[3].hasAbilities, false);
});

test("normalizeModel membersihkan suffix mode dan spasi ganda", () => {
  assert.equal(normalizeModel("Canon:EOS R5 (PTP mode)"), "Canon:EOS R5");
  assert.equal(normalizeModel("  Sony   A7 III  "), "Sony A7 III");
});

test("klasifikasi tipe 10 model contoh", () => {
  const cases = [
    ["Canon EOS 5D Mark IV", "Canon", "dslr"],
    ["Canon EOS R5", "Canon", "mirrorless"],
    ["Nikon D850", "Nikon", "dslr"],
    ["Nikon Z6", "Nikon", "mirrorless"],
    ["Sony Alpha-A7 III", "Sony", "mirrorless"],
    ["Sony DSC-RX100", "Sony", "compact"],
    ["Fujifilm X-T4", "Fujifilm", "mirrorless"],
    ["Panasonic DMC-GH4", "Panasonic", "mirrorless"],
    ["GoPro Hero 9", "GoPro", "action"],
    ["Agfa ePhoto 1280", "Agfa", "other"],
  ];
  for (const [model, brand, expected] of cases) {
    assert.equal(cameraTypeOf(model, brand, {}), expected, model);
  }
});

test("boothSupport dari kombinasi abilities", () => {
  assert.equal(boothSupportFromAbilities(["capture", "liveview"], true), "full");
  assert.equal(boothSupportFromAbilities(["capture"], true), "capture");
  assert.equal(boothSupportFromAbilities([], true), "transfer");
  assert.equal(boothSupportFromAbilities([], false), "unknown");
});

test("driverStatus membaca komentar", () => {
  assert.equal(driverStatusFromComment("Testing (Beta)"), "testing");
  assert.equal(driverStatusFromComment("Experimental"), "experimental");
  assert.equal(driverStatusFromComment("Deprecated"), "deprecated");
  assert.equal(driverStatusFromComment(""), "production");
});

test("validateSnapshot menolak snapshot kecil dan id duplikat", () => {
  const camera = {
    id: "A",
    model: "A",
    brand: "Canon",
    camera_type: "dslr",
    booth_support: "full",
    driver_status: "production",
  };
  const small = { count: 1, cameras: [camera] };
  assert.ok(validateSnapshot(small).some((error) => error.includes("<")));

  const many = {
    count: 2,
    cameras: Array.from({ length: 2 }, () => camera),
  };
  assert.ok(validateSnapshot(many).some((error) => error.includes("duplikat")));
});

test("buildCatalog menghasilkan id unik dan label valid", () => {
  const html = `<table>
<tr><th>Camera Model</th><th>Additional Abilities</th><th>Comments</th></tr>
<tr><td>Canon EOS R5</td><td>Image Capture, Liveview</td><td>&nbsp;</td></tr>
<tr><td>Nikon Z6</td><td>Image Capture</td><td>&nbsp;</td></tr>
</table>`;
  const catalog = buildCatalog({
    htmlText: html,
    jsonText: "",
    overrides: {},
    source: { kind: "test", url: "", version: "2.5.32" },
  });
  assert.equal(catalog.count, 2);
  assert.equal(catalog.cameras[0].booth_support, "full");
  assert.equal(catalog.cameras[1].booth_support, "capture");
  assert.equal(new Set(catalog.cameras.map((camera) => camera.id)).size, 2);
});
