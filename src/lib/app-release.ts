/**
 * Bentuk rilis aplikasi yang dilihat owner + perbandingan versi booth.
 *
 * Bebas `server-only` supaya kartu (client) dan tes bisa mengimpornya. Tidak
 * ada yang membaca database di sini.
 */

export type AppReleaseView = {
  id: string;
  version: string;
  download_url: string;
  file_name: string;
  file_size_bytes: number | null;
  sha256: string | null;
  release_notes: string | null;
  created_at: string;
};

/**
 * -1 / 0 / 1 untuk versi `x.y.z`. Versi di luar bentuk itu (mis. `0.0.0-dev`)
 * dianggap setara bagian numeriknya; laporan booth divalidasi semver di schema,
 * jadi kasus ini hanya muncul dari data lama.
 */
export function compareAppVersions(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** Booth tanpa laporan bukan "perlu update"; itu ditampilkan terpisah. */
export function needsAppUpdate(reported: string | null | undefined, latest: string): boolean {
  if (!reported) return false;
  return compareAppVersions(reported, latest) < 0;
}

/** Host tujuan, supaya owner tahu tautan mengarah ke mana sebelum diklik. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const value = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)} MB`;
}

export function formatReleaseDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(iso));
}
