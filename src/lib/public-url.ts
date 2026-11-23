import "server-only";

/** Base URL publik untuk link di email. Fallback aman ke domain produksi. */
export function publicBaseUrl(): string {
  const configured =
    process.env.SnapyOS_PUBLIC_BASE_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "https://snapyos.site";
  return configured.replace(/\/$/, "");
}
