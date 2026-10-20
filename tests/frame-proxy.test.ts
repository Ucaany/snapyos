import test from "node:test";
import assert from "node:assert/strict";

import {
  allowedFrameOrigins,
  isAllowedFrameTarget,
  type FrameProxyEnv,
} from "../src/lib/frame-proxy.ts";

const R2_BUCKET = "snapyos-business-assets";
const R2_ORIGIN = "https://1acbfce09ab44e80ceb41a430a07dbc3.r2.cloudflarestorage.com";

const ENV: FrameProxyEnv = {
  SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  R2_ENDPOINT: `${R2_ORIGIN}/`,
  R2_ACCOUNT_ID: "1acbfce09ab44e80ceb41a430a07dbc3",
  R2_BUCKET_BUSINESS_ASSETS: R2_BUCKET,
  NODE_ENV: "test",
};

const KEY = "11111111-1111-4111-8111-111111111111/templates/1791916243066-k10-chroma-2.png";

const ok = (url: string, env: FrameProxyEnv = ENV) => isAllowedFrameTarget(new URL(url), env);

test("frame proxy: signed URL R2 path-style diterima", () => {
  // Regresi: bucket R2 nyata jadi segmen path pertama (forcePathStyle), bukan
  // segmen literal "/business-assets/". Pemeriksaan literal menolak SEMUA frame
  // R2 → editor kiosk menolak finalize karena frame gagal dimuat.
  assert.equal(ok(`${R2_ORIGIN}/${R2_BUCKET}/${KEY}?X-Amz-Signature=abc&X-Amz-Expires=3600`), true);
});

test("frame proxy: signed URL Supabase Storage diterima", () => {
  assert.equal(
    ok(
      `https://abcdefghijklmnop.supabase.co/storage/v1/object/sign/business-assets/${KEY}?token=xyz`
    ),
    true
  );
});

test("frame proxy: legacy R2_BUCKET tunggal juga diterima", () => {
  const legacy: FrameProxyEnv = {
    ...ENV,
    R2_BUCKET_BUSINESS_ASSETS: undefined,
    R2_BUCKET: "snapyos-assets",
  };
  assert.equal(ok(`${R2_ORIGIN}/snapyos-assets/${KEY}`, legacy), true);
});

test("frame proxy: origin di luar allowlist ditolak", () => {
  assert.equal(ok(`https://evil.example.com/${R2_BUCKET}/${KEY}`), false);
  // Origin R2 yang benar tapi host menyerupai (subdomain tambahan) tetap ditolak.
  assert.equal(ok(`https://evil.${R2_ORIGIN.replace("https://", "")}/${R2_BUCKET}/${KEY}`), false);
});

test("frame proxy: bucket lain di origin R2 ditolak", () => {
  // generated-photos tidak boleh diproksikan lewat jalur frame.
  assert.equal(ok(`${R2_ORIGIN}/snapyos-generated-photos/${KEY}`), false);
  // Bucket kosong / hanya nama bucket tanpa key.
  assert.equal(ok(`${R2_ORIGIN}/${R2_BUCKET}`), false);
  assert.equal(ok(`${R2_ORIGIN}/`), false);
});

test("frame proxy: kredensial di URL ditolak", () => {
  assert.equal(
    ok(`https://user:pass@${R2_ORIGIN.replace("https://", "")}/${R2_BUCKET}/${KEY}`),
    false
  );
});

test("frame proxy: http hanya di non-production", () => {
  const dev: FrameProxyEnv = {
    ...ENV,
    R2_ENDPOINT: "http://localhost:9000",
    NODE_ENV: "development",
  };
  assert.equal(ok(`http://localhost:9000/${R2_BUCKET}/${KEY}`, dev), true);
  const prod: FrameProxyEnv = { ...dev, NODE_ENV: "production" };
  assert.equal(ok(`http://localhost:9000/${R2_BUCKET}/${KEY}`, prod), false);
});

test("frame proxy: env R2 kosong → hanya Supabase yang sah", () => {
  const bare: FrameProxyEnv = { SUPABASE_URL: ENV.SUPABASE_URL, NODE_ENV: "production" };
  assert.equal(ok(`${R2_ORIGIN}/${R2_BUCKET}/${KEY}`, bare), false);
  assert.equal(
    ok(`https://abcdefghijklmnop.supabase.co/storage/v1/object/sign/business-assets/${KEY}`, bare),
    true
  );
});

test("frame proxy: origin R2 diturunkan dari R2_ACCOUNT_ID bila endpoint kosong", () => {
  const derived: FrameProxyEnv = { ...ENV, R2_ENDPOINT: undefined };
  assert.equal(allowedFrameOrigins(derived).has(R2_ORIGIN), true);
  assert.equal(ok(`${R2_ORIGIN}/${R2_BUCKET}/${KEY}`, derived), true);
});

test("frame proxy: SUPABASE_URL tidak valid diabaikan, tidak melempar", () => {
  const broken: FrameProxyEnv = { ...ENV, SUPABASE_URL: "bukan-url" };
  assert.equal(allowedFrameOrigins(broken).has(R2_ORIGIN), true);
});
