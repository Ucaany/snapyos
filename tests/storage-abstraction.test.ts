/**
 * Phase 2 — storage abstraction checks (node:test, tanpa framework).
 * Menguji bagian PURE: pemetaan key area→R2 (paritas key Supabase) dan
 * konstanta TTL signed URL terpusat. Provider penuh (Supabase/R2) menyentuh
 * `server-only` + kredensial sehingga diverifikasi lewat typecheck + integrasi.
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { R2_AREAS, R2_BUCKET_ENV, r2BucketName, r2Key } from "../src/lib/r2/areas.ts";
import {
  resolveWriteProviderName,
  resolveFallbackProviderName,
  r2Configured,
} from "../src/lib/r2/provider.ts";
import { StorageResolver } from "../src/lib/r2/resolver.ts";
import { SIGNED_URL_TTL_SECONDS } from "../src/lib/constants.ts";

test("r2Key: key Supabase dipakai apa adanya (bucket per-area, tanpa prefix)", () => {
  assert.equal(
    r2Key("business-assets", "biz-1/branding/logo-123.png"),
    "biz-1/branding/logo-123.png"
  );
  assert.equal(
    r2Key("generated-photos", "biz-1/sessions/s1/photo-00.jpg"),
    "biz-1/sessions/s1/photo-00.jpg"
  );
  // Leading slash dinormalisasi (tidak menghasilkan "/...").
  assert.equal(r2Key("business-assets", "/biz-1/x.png"), "biz-1/x.png");
});

test("r2Key: path traversal (.. / backslash) ditolak", () => {
  assert.throws(() => r2Key("business-assets", "biz-1/branding/../../evil.svg"), /path traversal/);
  assert.throws(() => r2Key("business-assets", "..\\..\\evil.svg"), /path traversal/);
  assert.throws(() => r2Key("business-assets", "biz-1/.."), /path traversal/);
  // Nama file normal yang mengandung titik tetap lolos.
  assert.equal(r2Key("business-assets", "biz-1/logo.v2.png"), "biz-1/logo.v2.png");
});

test("R2_BUCKET_ENV: satu env per area, nama unik", () => {
  assert.equal(R2_BUCKET_ENV["business-assets"], "R2_BUCKET_BUSINESS_ASSETS");
  assert.equal(R2_BUCKET_ENV["generated-photos"], "R2_BUCKET_GENERATED_PHOTOS");
  assert.equal(new Set(Object.values(R2_BUCKET_ENV)).size, R2_AREAS.length);
});

test("r2BucketName: per-area menang, fallback legacy R2_BUCKET", () => {
  const env = {
    R2_BUCKET_BUSINESS_ASSETS: "snapyos-business-assets",
    R2_BUCKET_GENERATED_PHOTOS: "snapyos-generated-photos",
  };
  assert.equal(r2BucketName("business-assets", env), "snapyos-business-assets");
  assert.equal(r2BucketName("generated-photos", env), "snapyos-generated-photos");
  // Fallback legacy bila env per-area kosong.
  assert.equal(r2BucketName("business-assets", { R2_BUCKET: "legacy" }), "legacy");
  assert.equal(r2BucketName("generated-photos", {}), "");
});

test("SIGNED_URL_TTL_SECONDS: satu konstanta terpusat (1 jam)", () => {
  assert.equal(SIGNED_URL_TTL_SECONDS, 3600);
});

const R2_ENV = {
  R2_BUCKET: "b",
  R2_ACCESS_KEY_ID: "k",
  R2_SECRET_ACCESS_KEY: "s",
  R2_ACCOUNT_ID: "acct",
};

test("resolveWriteProviderName: default R2 hanya bila R2 env lengkap", () => {
  // R2 env lengkap → default R2 (Fase 3).
  assert.equal(resolveWriteProviderName(R2_ENV), "r2");
  assert.equal(resolveWriteProviderName({ ...R2_ENV, STORAGE_PROVIDER: "supabase" }), "r2");
  assert.equal(resolveWriteProviderName({ ...R2_ENV, STORAGE_PROVIDER: "SUPABASE" }), "r2");
});

test("resolveWriteProviderName: R2 env kosong → turun ke Supabase (anti-outage)", () => {
  assert.equal(resolveWriteProviderName({}), "supabase");
  assert.equal(resolveWriteProviderName({ STORAGE_PROVIDER: "" }), "supabase");
  assert.equal(resolveWriteProviderName({ STORAGE_PROVIDER: "supabase" }), "supabase");
  // Env R2 tidak lengkap (kurang secret) → Supabase.
  assert.equal(
    resolveWriteProviderName({ R2_BUCKET: "b", R2_ACCESS_KEY_ID: "k", R2_ACCOUNT_ID: "acct" }),
    "supabase"
  );
});

test("resolveWriteProviderName: override eksplisit menang (tanpa cek env)", () => {
  assert.equal(resolveWriteProviderName({ STORAGE_WRITE_PROVIDER: "r2" }), "r2");
  assert.equal(resolveWriteProviderName({ STORAGE_WRITE_PROVIDER: "supabase" }), "supabase");
  assert.equal(
    resolveWriteProviderName({ STORAGE_WRITE_PROVIDER: "supabase", STORAGE_PROVIDER: "r2" }),
    "supabase"
  );
});

test("resolveWriteProviderName: legacy r2 tetap dihormati tanpa env", () => {
  assert.equal(resolveWriteProviderName({ STORAGE_PROVIDER: "r2" }), "r2");
});

test("r2Configured: butuh bucket+key+secret+endpoint/account", () => {
  assert.equal(r2Configured(R2_ENV), true);
  assert.equal(r2Configured({ ...R2_ENV, R2_ACCOUNT_ID: "", R2_ENDPOINT: "https://x" }), true);
  assert.equal(r2Configured({ ...R2_ENV, R2_ACCOUNT_ID: "" }), false);
  assert.equal(r2Configured({}), false);
});

test("resolveFallbackProviderName: bukan write; R2 dipertahankan bila terkonfigurasi", () => {
  // write=R2 → fallback Supabase.
  assert.equal(resolveFallbackProviderName(R2_ENV), "supabase");
  // write=Supabase + R2 env lengkap → fallback R2 (objek era R2 tidak stranded).
  assert.equal(
    resolveFallbackProviderName({ ...R2_ENV, STORAGE_WRITE_PROVIDER: "supabase" }),
    "r2"
  );
  // write=Supabase + R2 tidak terkonfigurasi → fallback Supabase (single-provider).
  assert.equal(resolveFallbackProviderName({ STORAGE_WRITE_PROVIDER: "supabase" }), "supabase");
  assert.equal(resolveFallbackProviderName({}), "supabase");
});

// --- StorageResolver: dual-storage read routing -----------------------------

function makeProvider(name: string, present: Set<string>) {
  const calls: string[] = [];
  return {
    name,
    calls,
    head: async (_bucket: string, key: string): Promise<boolean | null> => {
      calls.push(key);
      return present.has(key) ? true : false;
    },
  };
}

test("resolver: objek baru (ada di write=R2) dipilih R2", async () => {
  const r2 = makeProvider("r2", new Set(["new.jpg"]));
  const sb = makeProvider("supabase", new Set());
  const resolver = new StorageResolver(r2, sb);
  const provider = await resolver.resolve("generated-photos", "new.jpg");
  assert.equal(provider.name, "r2");
});

test("resolver: objek lama (hanya di Supabase) fallback ke Supabase", async () => {
  const r2 = makeProvider("r2", new Set());
  const sb = makeProvider("supabase", new Set(["old.jpg"]));
  const resolver = new StorageResolver(r2, sb);
  const provider = await resolver.resolve("generated-photos", "old.jpg");
  assert.equal(provider.name, "supabase");
});

test("resolver: tidak ditemukan di mana pun → write-provider (default)", async () => {
  const r2 = makeProvider("r2", new Set());
  const sb = makeProvider("supabase", new Set());
  const resolver = new StorageResolver(r2, sb);
  const provider = await resolver.resolve("business-assets", "missing.png");
  assert.equal(provider.name, "r2");
});

test("resolver: hasil di-cache (tidak probe ulang untuk key sama)", async () => {
  const r2 = makeProvider("r2", new Set());
  const sb = makeProvider("supabase", new Set(["old.jpg"]));
  const resolver = new StorageResolver(r2, sb);
  await resolver.resolve("generated-photos", "old.jpg");
  await resolver.resolve("generated-photos", "old.jpg");
  assert.deepEqual(sb.calls, ["old.jpg"]);
});

test("resolver: write == fallback (mode lama) → nol probe", async () => {
  const sb = makeProvider("supabase", new Set());
  const resolver = new StorageResolver(sb, sb);
  const provider = await resolver.resolve("business-assets", "x.png");
  assert.equal(provider.name, "supabase");
  assert.deepEqual(sb.calls, []);
});

test("resolver: bucket berbeda tidak mencampur cache", async () => {
  const r2 = makeProvider("r2", new Set(["k.jpg"]));
  const sb = makeProvider("supabase", new Set(["k.jpg"]));
  const resolver = new StorageResolver(r2, sb);
  assert.equal((await resolver.resolve("business-assets", "k.jpg")).name, "r2");
  assert.equal((await resolver.resolve("generated-photos", "k.jpg")).name, "r2");
});

// --- resolveOutcome: present / absent / unknown (jalur delete) --------------

function makeProbeProvider(name: string, result: boolean | null) {
  return { name, head: async (): Promise<boolean | null> => result };
}

test("resolveOutcome: ada di fallback → present (provider Supabase)", async () => {
  const r2 = makeProbeProvider("r2", false);
  const sb = makeProbeProvider("supabase", true);
  const resolver = new StorageResolver(r2, sb);
  const outcome = await resolver.resolveOutcome("generated-photos", "old.jpg");
  assert.equal(outcome.status, "present");
  assert.equal(outcome.status === "present" ? outcome.provider.name : "", "supabase");
});

test("resolveOutcome: kedua provider tegas false → absent", async () => {
  const r2 = makeProbeProvider("r2", false);
  const sb = makeProbeProvider("supabase", false);
  const resolver = new StorageResolver(r2, sb);
  assert.equal((await resolver.resolveOutcome("business-assets", "gone.png")).status, "absent");
});

test("resolveOutcome: ada provider null (error) → unknown (jangan hapus baris DB)", async () => {
  const r2 = makeProbeProvider("r2", false);
  const sb = makeProbeProvider("supabase", null);
  const resolver = new StorageResolver(r2, sb);
  assert.equal((await resolver.resolveOutcome("generated-photos", "x.jpg")).status, "unknown");
});

test("resolveOutcome: write===fallback → present (tanpa probe)", async () => {
  const sb = makeProbeProvider("supabase", false);
  const resolver = new StorageResolver(sb, sb);
  assert.equal((await resolver.resolveOutcome("business-assets", "x.png")).status, "present");
});
