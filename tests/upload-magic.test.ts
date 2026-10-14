import test from "node:test";
import assert from "node:assert/strict";
import {
  sniffImageType,
  validateFinalizeRequest,
  validateJpegDimensions,
  validateLogoFile,
  validatePhotoFile,
} from "../src/lib/upload-validation.ts";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = Uint8Array.from([
  0xff, 0xd8, // SOI
  0xff, 0xe0, 0x00, 0x10, // APP0, panjang 16
  0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x10, 0x03, // SOF0 16x16
  0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x00, 0x03, 0x00, 0x00, 0x3f, 0x00, // SOS
  0xff, 0xd9, // EOI
]);
const JPEG_TRUNCATED = JPEG.slice(0, JPEG.length - 2);
const JPEG_POLYGLOT = Uint8Array.from([...JPEG_TRUNCATED, ...Buffer.from("%PDF-1.4 ...")]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
]);
const SVG = Uint8Array.from(Buffer.from(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>`));
const SVG_BARE = Uint8Array.from(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"/>`));
const SVG_WS = Uint8Array.from(Buffer.from(`\n  <?xml version="1.0"?>\n<svg/>`));
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const PDF = Uint8Array.from(Buffer.from(`%PDF-1.4 ...`));

// --- sniffImageType ---

test("sniffImageType: mengenali PNG/JPEG/WebP dari magic byte", () => {
  assert.equal(sniffImageType(PNG), "image/png");
  assert.equal(sniffImageType(JPEG), "image/jpeg");
  assert.equal(sniffImageType(WEBP), "image/webp");
});

test("sniffImageType: null untuk tipe di luar allowlist / buffer acak / kosong", () => {
  assert.equal(sniffImageType(GIF), null);
  assert.equal(sniffImageType(PDF), null);
  assert.equal(sniffImageType(new Uint8Array(0)), null);
  assert.equal(sniffImageType(Uint8Array.from([0x89, 0x50])), null);
});

test("sniffImageType: SVG tidak lagi dikenali (dihapus dari allowlist logo)", () => {
  assert.equal(sniffImageType(SVG), null);
  assert.equal(sniffImageType(SVG_BARE), null);
  assert.equal(sniffImageType(SVG_WS), null);
});

// --- validateLogoFile (dengan buffer) ---

test("validateLogoFile: MIME ter spoofing ditolak via magic byte", () => {
  // Klaim PNG, isi PDF → ditolak
  assert.equal(validateLogoFile({ name: "evil.png", type: "image/png", size: 1000 }, PDF).ok, false);
  // Klaim SVG, isi PNG → ditolak (SVG juga tidak ada di allowlist)
  assert.equal(validateLogoFile({ name: "evil.svg", type: "image/svg+xml", size: 1000 }, PNG).ok, false);
  // Klaim JPEG, isi GIF → ditolak
  assert.equal(validateLogoFile({ name: "evil.jpg", type: "image/jpeg", size: 1000 }, GIF).ok, false);
});

test("validateLogoFile: SVG ditolak (dihapus dari allowlist logo)", () => {
  // MIME SVG asli → ditolak, walau byte-nya benar-benar SVG
  assert.equal(validateLogoFile({ name: "l.svg", type: "image/svg+xml", size: SVG.length }, SVG).ok, false);
  // MIME SVG tanpa buffer → ditolak juga
  assert.equal(validateLogoFile({ name: "l.svg", type: "image/svg+xml", size: 100 }, null).ok, false);
});

test("validateLogoFile: konten asli lolos", () => {
  assert.deepEqual(validateLogoFile({ name: "l.png", type: "image/png", size: PNG.length }, PNG), {
    ok: true,
    ext: "png",
  });
  assert.deepEqual(validateLogoFile({ name: "l.jpg", type: "image/jpeg", size: JPEG.length }, JPEG), {
    ok: true,
    ext: "jpg",
  });
  assert.deepEqual(validateLogoFile({ name: "l.webp", type: "image/webp", size: WEBP.length }, WEBP), {
    ok: true,
    ext: "webp",
  });
});

test("validateLogoFile: tanpa buffer tetap pakai allowlist MIME (kompatibilitas)", () => {
  assert.equal(validateLogoFile({ name: "l.png", type: "image/png", size: 100 }).ok, true);
  assert.equal(validateLogoFile({ name: "l.png", type: "application/pdf", size: 100 }).ok, false);
});

// --- validatePhotoFile (dengan buffer) ---

test("validatePhotoFile: hanya JPEG asli lolos", () => {
  assert.deepEqual(
    validatePhotoFile({ name: "p.jpg", type: "image/jpeg", size: JPEG.length }, JPEG),
    { ok: true, ext: "jpg" }
  );
  // Klaim JPEG, isi PNG → ditolak
  assert.equal(validatePhotoFile({ name: "p.jpg", type: "image/jpeg", size: PNG.length }, PNG).ok, false);
  // Klaim JPEG, isi PDF → ditolak
  assert.equal(validatePhotoFile({ name: "p.jpg", type: "image/jpeg", size: PDF.length }, PDF).ok, false);
  // MIME salah tetap ditolak walau isi JPEG
  assert.equal(validatePhotoFile({ name: "p.jpg", type: "image/png", size: JPEG.length }, JPEG).ok, false);
});

test("validatePhotoFile: JPEG terpotong atau polyglot ditolak", () => {
  assert.equal(
    validatePhotoFile({ name: "p.jpg", type: "image/jpeg", size: JPEG_TRUNCATED.length }, JPEG_TRUNCATED).ok,
    false
  );
  assert.equal(
    validatePhotoFile({ name: "p.jpg", type: "image/jpeg", size: JPEG_POLYGLOT.length }, JPEG_POLYGLOT).ok,
    false
  );
});

test("validateJpegDimensions: dimensi wajar lolos, dekompresi ekstrem ditolak", () => {
  assert.equal(validateJpegDimensions(JPEG), true);
  const bomb = Uint8Array.from(JPEG);
  bomb[25] = 0xff;
  bomb[26] = 0xff;
  bomb[27] = 0xff;
  bomb[28] = 0xff;
  assert.equal(validateJpegDimensions(bomb), false);
});

test("validateFinalizeRequest: batas jumlah foto dan total byte", () => {
  assert.equal(validateFinalizeRequest(10 * 1024 * 1024, 3), null);
  assert.notEqual(validateFinalizeRequest(60 * 1024 * 1024, 3), null);
  assert.notEqual(validateFinalizeRequest(1024, 0), null);
  assert.notEqual(validateFinalizeRequest(1024, 51), null);
});
