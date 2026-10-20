/**
 * Satuan storage — MB tunggal untuk kuota, pemakaian, dan tampilan.
 * Regresi: topbar pernah menampilkan GB saat pemakaian ≥1024 MB.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BYTES_PER_MB,
  bytesToMb,
  formatStorageMb,
  mbToBytes,
  storageAddOnDisplayName,
  sumStorageAddOnMb,
} from "../src/lib/storage-units.ts";

test("1 MB = 1.048.576 bytes (biner, eksplisit)", () => {
  assert.equal(BYTES_PER_MB, 1_048_576);
  assert.equal(mbToBytes(1), 1_048_576);
  assert.equal(mbToBytes(1024), 1_073_741_824);
});

test("MB → bytes menolak pecahan/negatif/NaN tanpa menghasilkan kuota negatif", () => {
  assert.equal(mbToBytes(1.9), BYTES_PER_MB);
  assert.equal(mbToBytes(0), 0);
  assert.equal(mbToBytes(-5), 0);
  assert.equal(mbToBytes(Number.NaN), 0);
  assert.equal(mbToBytes(Number.POSITIVE_INFINITY), 0);
});

test("bytes → MB dibulatkan ke atas agar pemakaian sebagian tetap terlihat", () => {
  assert.equal(bytesToMb(0), 0);
  assert.equal(bytesToMb(1), 1);
  assert.equal(bytesToMb(BYTES_PER_MB), 1);
  assert.equal(bytesToMb(BYTES_PER_MB + 1), 2);
  assert.equal(bytesToMb(-1), 0);
});

test("tampilan selalu MB — 1024 MB tidak pernah menjadi 1 GB", () => {
  assert.equal(formatStorageMb(1024), "1.024 MB");
  assert.equal(formatStorageMb(5120), "5.120 MB");
  assert.equal(formatStorageMb(0), "0 MB");
  assert.equal(formatStorageMb(-3), "0 MB");
  assert.ok(!formatStorageMb(2048).includes("GB"));
});

test("kuota dan pemakaian bolak-balik konsisten", () => {
  const limitBytes = mbToBytes(512);
  assert.equal(bytesToMb(limitBytes), 512);
  assert.equal(bytesToMb(limitBytes - 1), 512);
  assert.equal(bytesToMb(limitBytes + 1), 513);
});

test("nama add-on storage legacy dinormalisasi ke MB saat dibaca", () => {
  assert.equal(
    storageAddOnDisplayName({ name: "Tambah Storage 1 GB", unit: "storage", storageMb: 1024 }),
    "Tambah Storage 1.024 MB"
  );
  assert.equal(
    storageAddOnDisplayName({ name: "tambah storage 1 gb", unit: "storage", storageMb: 1024 }),
    "Tambah Storage 1.024 MB"
  );
});

test("normalisasi nama add-on tidak menyentuh non-storage atau nama tanpa label GB", () => {
  assert.equal(
    storageAddOnDisplayName({ name: "Add-on +1 Sesi", unit: "session", storageMb: null }),
    "Add-on +1 Sesi"
  );
  assert.equal(
    storageAddOnDisplayName({ name: "Tambah Storage 1.024 MB", unit: "storage", storageMb: 1024 }),
    "Tambah Storage 1.024 MB"
  );
  assert.equal(
    storageAddOnDisplayName({ name: "Tambah Storage 1 GB", unit: "storage", storageMb: null }),
    "Tambah Storage 1 GB"
  );
});

test("kuota add-on: storage_mb × quantity, add-on non-storage diabaikan", () => {
  assert.equal(
    sumStorageAddOnMb([
      { quantity: 1, addOn: { storage_mb: 1024 } },
      { quantity: 3, addOn: { storage_mb: 1024 } },
      { quantity: 2, addOn: { storage_mb: null } },
    ]),
    4096
  );
});

test("kuota add-on: quantity null/negatif/pecahan tidak menghasilkan kuota negatif", () => {
  assert.equal(sumStorageAddOnMb([{ quantity: null, addOn: { storage_mb: 1024 } }]), 0);
  assert.equal(sumStorageAddOnMb([{ quantity: -2, addOn: { storage_mb: 1024 } }]), 0);
  assert.equal(sumStorageAddOnMb([{ quantity: 2.9, addOn: { storage_mb: 1024 } }]), 2048);
});

test("kuota add-on: baris tanpa relasi add-on tidak dihitung", () => {
  assert.equal(sumStorageAddOnMb([{ quantity: 1, addOn: null }]), 0);
});
