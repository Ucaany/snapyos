/**
 * R2 `remove()` — kegagalan per key dari `DeleteObjectsCommand.Errors`.
 *
 * Alasan: HTTP 200 dari DeleteObjects BUKAN bukti sukses. Bila provider
 * mengabaikan `Errors[]`, cron retention/sweep akan mengira objek terhapus,
 * menghapus baris DB + mengurangi used_bytes → media pelanggan hilang dari
 * ledger padahal masih ada (atau sebaliknya, terus menagih). Tes ini memaksa
 * provider melaporkan key gagal secara spesifik.
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./tests/helpers/resolve-loader.mjs", pathToFileURL("./"));

import { splitRemoveOutcome } from "../src/lib/r2/remove-outcome.ts";

type ProviderModule = typeof import("../src/server/storage/r2-provider.ts");

process.env.R2_BUCKET_GENERATED_PHOTOS = "test-generated";
process.env.R2_BUCKET_BUSINESS_ASSETS = "test-assets";
process.env.R2_ACCOUNT_ID = "test-account";
process.env.R2_ACCESS_KEY_ID = "test-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret";

/** Client palsu: meniru respons DeleteObjects (200 + Errors[]). */
function fakeClient(response: {
  Errors?: { Key?: string; Code?: string; Message?: string }[];
  throwOnSend?: unknown;
}) {
  const sent: { name: string; input: unknown }[] = [];
  return {
    sent,
    client: {
      async send(command: { constructor: { name: string }; input: unknown }) {
        sent.push({ name: command.constructor.name, input: command.input });
        if (response.throwOnSend) throw response.throwOnSend;
        return { Errors: response.Errors ?? [] };
      },
    },
  };
}

test("r2 remove: semua sukses (Errors kosong) → error null", async () => {
  const { R2StorageProvider } =
    (await import("../src/server/storage/r2-provider.ts")) as ProviderModule;
  const { client, sent } = fakeClient({ Errors: [] });
  const provider = new R2StorageProvider(client as never);
  const keys = ["biz-1/sessions/s1/photo-00.jpg", "biz-1/sessions/s1/result.gif"];

  const result = await provider.remove("generated-photos", keys);

  assert.equal(result.error, null);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.name, "DeleteObjectsCommand");
  const input = sent[0]!.input as { Bucket: string; Delete: { Objects: { Key: string }[] } };
  assert.equal(input.Bucket, "test-generated");
  assert.deepEqual(
    input.Delete.Objects.map((o) => o.Key),
    keys
  );
});

test("r2 remove: HTTP 200 + Errors[] → error memuat key gagal (bentuk key ASLI tanpa prefix)", async () => {
  const { R2StorageProvider } =
    (await import("../src/server/storage/r2-provider.ts")) as ProviderModule;
  const okKey = "biz-1/sessions/s2/photo-00.jpg";
  const badKey = "biz-1/sessions/s2/photo-01.jpg";
  const { client } = fakeClient({
    Errors: [{ Key: badKey, Code: "AccessDenied", Message: "Access Denied" }],
  });
  const provider = new R2StorageProvider(client as never);

  const result = await provider.remove("generated-photos", [okKey, badKey]);

  assert.ok(result.error, "200 dengan Errors[] WAJIB dilaporkan sebagai error");
  assert.deepEqual(result.error!.keys, [badKey]);
  assert.match(result.error!.message, /AccessDenied/);
  assert.match(result.error!.message, new RegExp(badKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  // Key sukses TIDAK boleh ikut dilaporkan gagal.
  assert.ok(!result.error!.keys!.includes(okKey));
});

test("r2 remove: error transport (throw) → error tanpa daftar key (seluruh batch tak pasti)", async () => {
  const { R2StorageProvider } =
    (await import("../src/server/storage/r2-provider.ts")) as ProviderModule;
  const { client } = fakeClient({
    throwOnSend: Object.assign(new Error("socket hang up"), { name: "TimeoutError" }),
  });
  const provider = new R2StorageProvider(client as never);

  const result = await provider.remove("generated-photos", ["biz-1/a.jpg"]);

  assert.ok(result.error);
  assert.match(result.error!.message, /socket hang up/);
  assert.equal(result.error!.keys, undefined);
});

test("r2 remove: key kosong array → tidak memanggil provider", async () => {
  const { R2StorageProvider } =
    (await import("../src/server/storage/r2-provider.ts")) as ProviderModule;
  const { client, sent } = fakeClient({ Errors: [] });
  const provider = new R2StorageProvider(client as never);

  const result = await provider.remove("generated-photos", []);

  assert.equal(result.error, null);
  assert.equal(sent.length, 0);
});

test("splitRemoveOutcome: error tanpa key → SEMUA gagal (tidak ada klaim sukses tanpa bukti)", () => {
  const outcome = splitRemoveOutcome(["a", "b"], { message: "boom" });
  assert.deepEqual(outcome.ok, []);
  assert.deepEqual(
    outcome.failures.map((f) => f.key),
    ["a", "b"]
  );
});

test("splitRemoveOutcome: error dengan key spesifik → hanya key itu gagal", () => {
  const outcome = splitRemoveOutcome(["a", "b", "c"], {
    message: "partial",
    keys: ["b"],
  });
  assert.deepEqual(outcome.ok, ["a", "c"]);
  assert.deepEqual(
    outcome.failures.map((f) => f.key),
    ["b"]
  );
});

test("splitRemoveOutcome: tanpa error → semua ok", () => {
  const outcome = splitRemoveOutcome(["a", "b"], null);
  assert.deepEqual(outcome.ok, ["a", "b"]);
  assert.deepEqual(outcome.failures, []);
});
