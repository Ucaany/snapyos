/**
 * Supabase/PostgREST error classification — schema drift detection.
 * PGRST205 = relation (table/view) tidak ditemukan; 42703 = kolom tidak ada.
 * Keduanya muncul saat migration belum diterapkan ke database live.
 */

export function isMissingRelation(error: { code?: string } | null | undefined): boolean {
  const code = error?.code;
  return code === "PGRST205" || code === "42703";
}

/**
 * PGRST202 = fungsi RPC tidak ditemukan di schema cache; juga tangkap pesan
 * generik PostgREST saat migration (mis. 0062 storage_account_*) belum
 * diterapkan. Dipakai untuk membedakan MISCONFIG (fungsi/tabel absen →
 * pemanggil boleh fail-open) dari kegagalan TRANSIENT (network/5xx → tahan).
 */
export function isMissingFunction(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  const code = error?.code;
  if (code === "PGRST202") return true;
  if (isMissingRelation(error)) return true;
  const msg = (error?.message ?? "").toLowerCase();
  return (
    msg.includes("could not find the function") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache")
  );
}
