// Pasang lifecycle rule Cloudflare R2 (hemat biaya) — idempotent.
// Usage: node scripts/r2-lifecycle.mjs [--dry-run] [--delete]
//
// WHY: cron retention/orphan-sweep bergantung pada aplikasi yang hidup. Bila
// cron mati (atau backlog), objek hasil foto menumpuk dan menagih storage.
// Lifecycle rule adalah jaring pengaman server-side:
//   generated-photos → expire objek setelah 3 hari
//   business-assets  → TANPA expire (logo/template = aset jangka panjang)
//   semua bucket     → AbortIncompleteMultipartUpload setelah 1 hari
//
// Idempotent: PUT menimpa konfigurasi dengan aturan yang SAMA setiap kali
// dijalankan; setelah PUT script membaca ulang (GetBucketLifecycleConfiguration)
// dan memverifikasi aturan yang diharapkan benar-benar terpasang. `--dry-run`
// hanya menampilkan rencana. `--delete` menghapus konfigurasi lifecycle.
//
// Kredensial dibaca dari .env.local (R2_*), sama seperti configure-r2-cors.mjs.
import { readFile } from "node:fs/promises";
import {
  S3Client,
  DeleteBucketLifecycleCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const removeRules = args.includes("--delete");

async function loadEnv() {
  const raw = await readFile(new URL("../.env.local", import.meta.url), "utf8").catch(() => null);
  if (!raw) {
    console.error("ERROR: .env.local tidak ditemukan (dibutuhkan untuk kredensial R2).");
    process.exit(1);
  }
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return env;
}

const env = await loadEnv();

const generatedBucket = env.R2_BUCKET_GENERATED_PHOTOS?.trim() || "";
const assetsBucket = env.R2_BUCKET_BUSINESS_ASSETS?.trim() || "";
const legacyBucket = env.R2_BUCKET?.trim() || "";

if (!generatedBucket && !assetsBucket && !legacyBucket) {
  console.error(
    "ERROR: tidak ada bucket R2 di env (R2_BUCKET_BUSINESS_ASSETS / R2_BUCKET_GENERATED_PHOTOS)."
  );
  process.exit(1);
}

/** Aturan yang diharapkan per bucket — SATU sumber untuk PUT dan verifikasi. */
function expectedRules(bucket) {
  const rules = [
    {
      ID: "abort-incomplete-multipart-1d",
      Status: "Enabled",
      Filter: { Prefix: "" },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
    },
  ];
  // Expire HANYA bila bucket hasil foto terpisah dari aset bisnis. Pada deploy
  // legacy satu bucket (R2_BUCKET), expire seluruh bucket akan menghapus logo/
  // template — lebih baik tanpa expire daripada kehilangan aset.
  if (bucket === generatedBucket && generatedBucket !== assetsBucket) {
    rules.unshift({
      ID: "expire-generated-photos-3d",
      Status: "Enabled",
      Filter: { Prefix: "" },
      Expiration: { Days: 3 },
    });
  }
  return rules;
}

/** Bucket target unik — legacy hanya dipakai bila bucket per-area tak diisi. */
const buckets = [
  ...new Set([generatedBucket || legacyBucket, assetsBucket || legacyBucket].filter(Boolean)),
];

const client = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

function summarize(rules) {
  return (rules ?? [])
    .map((r) => {
      const parts = [r.ID];
      if (r.Expiration?.Days) parts.push(`expire=${r.Expiration.Days}d`);
      if (r.AbortIncompleteMultipartUpload?.DaysAfterInitiation) {
        parts.push(`abort-mpu=${r.AbortIncompleteMultipartUpload.DaysAfterInitiation}d`);
      }
      return parts.join(" ");
    })
    .join(", ");
}

function matchesExpected(actual, expected) {
  const byId = new Map((actual ?? []).map((r) => [r.ID, r]));
  if (byId.size !== expected.length) return false;
  return expected.every((want) => {
    const got = byId.get(want.ID);
    if (!got) return false;
    const wantExpire = want.Expiration?.Days ?? null;
    const gotExpire = got.Expiration?.Days ?? null;
    if (wantExpire !== gotExpire) return false;
    const wantAbort = want.AbortIncompleteMultipartUpload?.DaysAfterInitiation ?? null;
    const gotAbort = got.AbortIncompleteMultipartUpload?.DaysAfterInitiation ?? null;
    return wantAbort === gotAbort;
  });
}

console.log(`Buckets: ${buckets.join(", ")}`);
console.log(`generated-photos: ${generatedBucket || "(legacy R2_BUCKET)"}`);
console.log(`business-assets : ${assetsBucket || "(legacy R2_BUCKET)"}`);

if (dryRun) {
  for (const bucket of buckets) {
    console.log(`DRY-RUN ${bucket}: ${summarize(expectedRules(bucket))}`);
  }
  process.exit(0);
}

let failed = false;
for (const Bucket of buckets) {
  try {
    if (removeRules) {
      await client.send(new DeleteBucketLifecycleCommand({ Bucket }));
      console.log(`OK ${Bucket}: lifecycle dihapus`);
      continue;
    }
    const expected = expectedRules(Bucket);
    await client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket,
        LifecycleConfiguration: { Rules: expected },
      })
    );
    const after = await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket }));
    if (!matchesExpected(after.Rules, expected)) {
      failed = true;
      console.error(`FAIL ${Bucket}: konfigurasi tidak sesuai setelah PUT`);
      console.error(`   actual: ${summarize(after.Rules)}`);
      continue;
    }
    console.log(`OK ${Bucket}: ${summarize(after.Rules)}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${Bucket}: ${error.name} ${error.message}`);
  }
}

// Verifikasi eksplisit: business-assets tidak boleh punya Expiration.
process.exit(failed ? 1 : 0);
