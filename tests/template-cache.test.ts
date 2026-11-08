/**
 * Cache template kiosk — modul MURNI src/lib/template-cache.ts.
 *
 * Yang diuji adalah kontrak yang dipakai bersama server + SW + klien:
 * key aset stabil per versi, plan warm idempoten, dan eviction tidak pernah
 * membuang thumbnail.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assetKey,
  filterTemplatesForPackage,
  frameCacheUrl,
  parseAssetKey,
  parseIndex,
  parseSnapshot,
  pickEvictions,
  planWarm,
  removedKeys,
  staleKeys,
  summarizeIndex,
  templateCacheKey,
  type AssetIndex,
} from "../src/lib/template-cache.ts";
import type { PublicTemplate } from "../src/lib/kiosk-types.ts";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";

function template(overrides: Partial<PublicTemplate> = {}): PublicTemplate {
  return {
    id: T1,
    name: "Frame",
    category: "custom",
    file_url: "/api/v1/public/frame?url=a",
    thumbnail_url: "/api/v1/public/frame?url=b&w=480",
    layout: null,
    slot_count: 3,
    version: 1000,
    package_ids: [],
    ...overrides,
  };
}

const indexOf = (...entries: [string, number, number][]): AssetIndex => ({
  schema: 1,
  entries: entries.map(([key, bytes, lastUsed]) => ({ key, bytes, lastUsed })),
});

test("assetKey: suffix persis @480 / @full", () => {
  assert.equal(assetKey(T1, 1000, "thumb"), `${T1}:1000@480`);
  assert.equal(assetKey(T1, 1000, "full"), `${T1}:1000@full`);
  // version tidak valid tidak boleh menghasilkan "NaN" (regex SW menolak).
  assert.equal(assetKey(T1, Number.NaN, "full"), `${T1}:0@full`);
});

test("templateCacheKey: basis tanpa suffix kind", () => {
  assert.equal(templateCacheKey(T1, 1000), `${T1}:1000`);
  assert.equal(templateCacheKey(T1, Number.NaN), `${T1}:0`);
});

test("parseAssetKey: kebalikan assetKey, key asing -> null", () => {
  assert.deepEqual(parseAssetKey(`${T1}:1000@480`), {
    templateId: T1,
    version: 1000,
    kind: "thumb",
  });
  assert.deepEqual(parseAssetKey(`${T1}:1000@full`), {
    templateId: T1,
    version: 1000,
    kind: "full",
  });
  assert.equal(parseAssetKey("bukan-key"), null);
  assert.equal(parseAssetKey(`${T1}@480`), null);
});

test("frameCacheUrl: identik dengan key yang dibentuk SW", () => {
  // SW: `${origin}/__frame/${encodeURIComponent(cache)}@${w}` dengan cache
  // = `${id}:${version}`. Harus sama persis dengan helper ini.
  assert.equal(
    frameCacheUrl("https://booth.test", assetKey(T1, 1000, "thumb")),
    `https://booth.test/__frame/${encodeURIComponent(`${T1}:1000`)}@480`
  );
  assert.equal(
    frameCacheUrl("https://booth.test", assetKey(T1, 1000, "full")),
    `https://booth.test/__frame/${encodeURIComponent(`${T1}:1000`)}@full`
  );
});

test("filterTemplatesForPackage: assignment menyempit, kosong -> semua", () => {
  const a = template({ id: T1, package_ids: ["p1"] });
  const b = template({ id: T2, package_ids: ["p2"] });
  assert.deepEqual(
    filterTemplatesForPackage([a, b], "p1").map((t) => t.id),
    [T1]
  );
  assert.deepEqual(
    filterTemplatesForPackage([a, b], "p3").map((t) => t.id),
    [T1, T2]
  );
  assert.deepEqual(filterTemplatesForPackage([], "p1"), []);
});

test("removedKeys: template hilang + key asing dipangkas", () => {
  const fresh = [template({ id: T1 })];
  const index = indexOf(
    [`${T1}:1000@480`, 10, 1],
    [`${T2}:1000@full`, 20, 2],
    ["rusak", 5, 3]
  );
  assert.deepEqual(removedKeys(fresh, index).sort(), ["rusak", `${T2}:1000@full`].sort());
});

test("staleKeys: hanya versi lama untuk template yang MASIH ada", () => {
  const fresh = [template({ id: T1, version: 2000 })];
  const index = indexOf(
    [`${T1}:1000@480`, 10, 1],
    [`${T1}:2000@480`, 10, 2],
    [`${T2}:1000@full`, 20, 3]
  );
  assert.deepEqual(staleKeys(fresh, index), [`${T1}:1000@480`]);
});

test("parseSnapshot: rusak / schema asing -> null", () => {
  assert.equal(parseSnapshot(null), null);
  assert.equal(parseSnapshot("{"), null);
  assert.equal(parseSnapshot(JSON.stringify({ schema: 2, fetchedAt: 1, templates: [] })), null);
  assert.equal(parseSnapshot(JSON.stringify({ schema: 1 })), null);
  const ok = parseSnapshot(
    JSON.stringify({ schema: 1, fetchedAt: 123, templates: [template()] })
  );
  assert.equal(ok?.templates.length, 1);
  assert.equal(ok?.fetchedAt, 123);
});

test("parseIndex: rusak -> index kosong", () => {
  assert.deepEqual(parseIndex(null), { schema: 1, entries: [] });
  assert.deepEqual(parseIndex("nope"), { schema: 1, entries: [] });
  assert.deepEqual(parseIndex(JSON.stringify({ schema: 3, entries: [] })), {
    schema: 1,
    entries: [],
  });
  const parsed = parseIndex(
    JSON.stringify({ schema: 1, entries: [{ key: "k", bytes: 4, lastUsed: 5 }] })
  );
  assert.deepEqual(parsed.entries, [{ key: "k", bytes: 4, lastUsed: 5 }]);
});

test("planWarm: idempoten, melanjutkan aset yang belum ada, prune template hilang", () => {
  const fresh = [template({ id: T1, version: 1000 })];
  const index = indexOf([`${T2}:900@full`, 20, 2]);
  const first = planWarm(fresh, index);

  assert.deepEqual(first.thumbs, [
    { key: `${T1}:1000@480`, url: "/api/v1/public/frame?url=b&w=480" },
  ]);
  assert.deepEqual(first.frames, [
    { key: `${T1}:1000@full`, url: "/api/v1/public/frame?url=a" },
  ]);
  assert.deepEqual(first.prune, [`${T2}:900@full`]);
  assert.deepEqual(first.stale, {});
  // Input sama -> output sama (tanpa mutasi index).
  assert.deepEqual(planWarm(fresh, index), first);
});

test("planWarm: thumbnail tanpa thumbnail_url memakai file_url", () => {
  const fresh = [template({ id: T1, thumbnail_url: null })];
  const plan = planWarm(fresh, { schema: 1, entries: [] });
  assert.equal(plan.thumbs[0]?.url, fresh[0]?.file_url);
});

test("planWarm: versi baru -> stale dikelompokkan per template", () => {
  const fresh = [template({ id: T1, version: 2000 })];
  const index = indexOf([`${T1}:1000@480`, 10, 1], [`${T1}:1000@full`, 20, 2]);
  const plan = planWarm(fresh, index);
  assert.deepEqual(plan.stale[T1]?.sort(), [`${T1}:1000@480`, `${T1}:1000@full`].sort());
  assert.equal(plan.prune.length, 0);
});

test("summarizeIndex: total byte entri", () => {
  assert.equal(summarizeIndex(indexOf(["a", 10, 1], ["b", 32, 2])).totalBytes, 42);
  assert.equal(summarizeIndex({ schema: 1, entries: [] }).totalBytes, 0);
});

test("pickEvictions: LRU dan tidak pernah memilih thumbnail", () => {
  const index = indexOf(
    [`${T1}:1@480`, 100, 1],
    [`${T1}:1@full`, 40, 2],
    [`${T2}:1@full`, 40, 3],
    [`${T2}:1@480`, 100, 0]
  );
  assert.deepEqual(pickEvictions(index, 10), [`${T1}:1@full`]);
  assert.deepEqual(pickEvictions(index, 40), [`${T1}:1@full`]);
  assert.deepEqual(pickEvictions(index, 80), [`${T1}:1@full`, `${T2}:1@full`]);
  // Butuh lebih dari total frame -> semua frame, thumbnail tetap utuh.
  assert.deepEqual(pickEvictions(index, 1000), [`${T1}:1@full`, `${T2}:1@full`]);
  assert.deepEqual(pickEvictions(index, 0), []);
});
