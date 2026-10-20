import assert from "node:assert/strict";
import { test } from "node:test";

import {
  posOrderCreateSchema,
  posManualPaySchema,
  posProductCreateSchema,
  posProductUpdateSchema,
} from "../src/lib/validators.ts";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const UUID2 = "123e4567-e89b-12d3-a456-426614174111";

test("posOrderCreateSchema: payload valid — hanya productId + qty + photoboxId (A8)", () => {
  const parsed = posOrderCreateSchema.parse({
    photoboxId: UUID,
    items: [{ productId: UUID2, qty: 1 }],
  });
  assert.equal(parsed.items.length, 1);
});

test("posOrderCreateSchema: qty 0 / 1000 / float ditolak", () => {
  for (const qty of [0, 1000, 1.5, -1]) {
    assert.ok(
      !posOrderCreateSchema.safeParse({
        photoboxId: UUID,
        items: [{ productId: UUID2, qty }],
      }).success
    );
  }
});

test("posOrderCreateSchema: items kosong / lebih dari 50 ditolak; photoboxId wajib", () => {
  assert.ok(!posOrderCreateSchema.safeParse({ photoboxId: UUID, items: [] }).success);
  assert.ok(
    !posOrderCreateSchema.safeParse({
      photoboxId: UUID,
      items: Array.from({ length: 51 }, () => ({ productId: UUID2, qty: 1 })),
    }).success
  );
  assert.ok(!posOrderCreateSchema.safeParse({ items: [{ productId: UUID2, qty: 1 }] }).success);
});

test("posManualPaySchema: hanya cash/bank_transfer/other", () => {
  for (const method of ["cash", "bank_transfer", "other"]) {
    assert.ok(posManualPaySchema.safeParse({ orderId: UUID, method }).success);
  }
  for (const method of ["qris", "offline", ""]) {
    assert.ok(!posManualPaySchema.safeParse({ orderId: UUID, method }).success);
  }
});

test("posProductCreateSchema: valid + kategori default 'lainnya'", () => {
  const parsed = posProductCreateSchema.parse({ name: "Keychain", price: 15_000 });
  assert.equal(parsed.category, "lainnya");
});

test("posProductCreateSchema: harga di bawah Rp 1.000 ditolak (server = source of truth)", () => {
  for (const price of [0, -1000, 1.5, 500, 999]) {
    assert.ok(!posProductCreateSchema.safeParse({ name: "X", price }).success);
  }
  assert.ok(posProductCreateSchema.safeParse({ name: "X", price: 1000 }).success);
});

test("posProductCreateSchema: stock nullable, cost ≥ 0", () => {
  assert.ok(
    posProductCreateSchema.safeParse({ name: "X", price: 1000, stock: null, cost: 0 }).success
  );
  assert.ok(!posProductCreateSchema.safeParse({ name: "X", price: 1000, cost: -1 }).success);
});

test("posProductUpdateSchema: minimal satu field + id", () => {
  assert.ok(posProductUpdateSchema.safeParse({ id: UUID, name: "Y" }).success);
  assert.ok(!posProductUpdateSchema.safeParse({ id: UUID }).success);
  assert.ok(!posProductUpdateSchema.safeParse({ name: "Y" }).success);
});
