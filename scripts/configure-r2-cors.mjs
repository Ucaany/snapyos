// Configure R2 bucket CORS for the browser cross-origin frame/image loads.
// Usage: node scripts/configure-r2-cors.mjs [--origin <url> ...] [--dry-run]
//
// WHY: the builder (TemplateBuilder) and kiosk editor (Editor) load frame PNGs
// with `crossOrigin="anonymous"` so the canvas stays untainted and compositing
// (composeFrame) can export via toBlob. That requires the R2 bucket to answer
// the CORS preflight with Access-Control-Allow-Origin; a private bucket with no
// CORS policy fails the image load (net::ERR_FAILED) and the frame never
// renders. This script sets an idempotent bucket CORS policy on both R2 areas.
//
// Allowed origins are taken from AUTH_URL + SnapyOS_PUBLIC_BASE_URL in
// .env.local, plus any --origin flags. Re-running overwrites the policy with
// the same rules (idempotent). Reads R2_* from .env.local.
import { readFile } from "node:fs/promises";
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from "@aws-sdk/client-s3";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const extraOrigins = args
  .map((a, i) => (a === "--origin" ? args[i + 1] : null))
  .filter((v) => typeof v === "string" && v.trim() !== "");

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

function allowedOrigins(env) {
  const set = new Set(extraOrigins);
  for (const key of ["AUTH_URL", "SnapyOS_PUBLIC_BASE_URL"]) {
    const value = env[key]?.trim();
    if (!value) continue;
    try {
      set.add(new URL(value).origin);
    } catch {
      console.warn(`WARN: ${key} bukan URL valid, dilewati: ${value}`);
    }
  }
  if (set.size === 0) {
    console.error(
      "ERROR: tidak ada origin. Set AUTH_URL / SnapyOS_PUBLIC_BASE_URL, atau pakai --origin <url>."
    );
    process.exit(1);
  }
  return [...set];
}

const env = await loadEnv();
const origins = allowedOrigins(env);
const buckets = [env.R2_BUCKET_BUSINESS_ASSETS, env.R2_BUCKET_GENERATED_PHOTOS, env.R2_BUCKET]
  .filter(Boolean)
  .filter((b, i, arr) => arr.indexOf(b) === i);

if (buckets.length === 0) {
  console.error(
    "ERROR: tidak ada bucket R2 di env (R2_BUCKET_BUSINESS_ASSETS / R2_BUCKET_GENERATED_PHOTOS)."
  );
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const corsRules = [
  {
    AllowedOrigins: origins,
    AllowedMethods: ["GET", "HEAD"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
    MaxAgeSeconds: 3600,
  },
];

console.log(`Origins: ${origins.join(", ")}`);
console.log(`Buckets: ${buckets.join(", ")}`);

if (dryRun) {
  console.log("--dry-run: tidak menulis apa pun.");
  process.exit(0);
}

let failed = false;
for (const Bucket of buckets) {
  try {
    const before = await client
      .send(new GetBucketCorsCommand({ Bucket }))
      .then((r) => JSON.stringify(r.CORSRules))
      .catch((e) => `(none: ${e.name})`);
    await client.send(
      new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: corsRules } })
    );
    const after = await client
      .send(new GetBucketCorsCommand({ Bucket }))
      .then((r) => JSON.stringify(r.CORSRules));
    console.log(`OK ${Bucket}`);
    console.log(`   before: ${before}`);
    console.log(`   after : ${after}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${Bucket}: ${error.name} ${error.message}`);
  }
}
process.exit(failed ? 1 : 0);
