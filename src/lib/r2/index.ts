/**
 * Barrel modul R2 (server-only).
 * Re-export area/prefix helper + client. Import hanya dari server code.
 */

export { getR2Client, getR2BucketForArea } from "./config";
export {
  R2_AREAS,
  R2_BUCKET_ENV,
  R2_BUCKET_ENV_LEGACY,
  r2BucketName,
  r2Key,
  type R2Area,
} from "./areas";
