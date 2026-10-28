"use client";

/**
 * Antrian finalize offline — sesi tetap bisa diselesaikan tanpa koneksi; foto
 * disimpan lokal (IndexedDB) lalu disinkronkan otomatis saat online kembali
 * (docs/05 §5.1b offline). Pembayaran tetap terbuka sampai sesi selesai —
 * status payment di-recover via polling saat reconnect.
 *
 * KEAMANAN (fix): device_token = bearer credential jangka-panjang TIDAK PERNAH
 * disimpan di IndexedDB (plaintext). Item antrian hanya menyimpan foto + metadata
 * minimal; token diambil dari live state kiosk saat sinkron (`syncOne(item, token)`).
 * Konsekuensi: reload/restart penuh perangkat menghapus `deviceToken` dari memori
 * → item antrian yatim disapu SETELAH grace (`ORPHAN_GRACE_MS`), bukan seketika
 * (Phase 6: reload singkat dulu menghapus foto pelanggan yang belum tersinkron).
 * Sesi `local_*` tidak pernah disapu di sini — runtime lokal yang menyelesaikannya.
 * ponytail: foto masih plaintext (WebCrypto envelope-encryption per-device key
 * di masa depan bila ancaman at-rest device theft jadi prioritas); retry interval
 * sederhana — pindah ke background-sync API / service worker bila kiosk proven
 * sering putus lama.
 */

const DB_NAME = "snapyos-kiosk";
const STORE = "finalize-queue";
// C4 (security): v2 = skema fix (tanpa device_token plaintext). Naikkan versi
// agar migrasi berjalan lewat `onupgradeneeded`, bukan deleteDatabase paksa.
const DB_VERSION = 2;
/** Flag sekali-jalan: purge DB lawas hanya pada boot pertama pasca-deploy. */
const MIGRATED_FLAG = "snapyos_kiosk_migrated_v1";

export type QueuedFinalize = {
  sessionId: string;
  businessSlug: string;
  templateId: string | null;
  retakeCount: number;
  photos: Blob[];
  /** Capture mentah (tanpa frame) untuk GIF slideshow. Item antrian lama
   *  tidak punya field ini — server lalu memakai `photos` sebagai fallback. */
  gifPhotos?: Blob[];
  queuedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "sessionId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

export async function enqueueFinalize(item: QueuedFinalize): Promise<void> {
  await tx("readwrite", (store) => store.put(item) as IDBRequest<IDBValidKey>);
}

export async function removeQueued(sessionId: string): Promise<void> {
  await tx("readwrite", (store) => store.delete(sessionId) as unknown as IDBRequest<undefined>);
}

export async function listQueued(): Promise<QueuedFinalize[]> {
  try {
    const items = await tx<QueuedFinalize[]>(
      "readonly",
      (store) => store.getAll() as IDBRequest<QueuedFinalize[]>
    );
    return items ?? [];
  } catch {
    return [];
  }
}

/**
 * Health-floor untuk deployment lama: buang database IndexedDB versi lawas yang
 * masih menyimpan `deviceToken` plaintext (versi pra-fix).
 *
 * C4 (security): SEKALI-JALAN. Sebelumnya fungsi ini menghapus DB yang SAMA
 * dengan antrian live (`STORE="finalize-queue"`) tiap mount → setiap reload
 * menghapus finalize yang belum tersinkron (data loss). Sekarang dipagari flag
 * `localStorage[MIGRATED_FLAG]`: boot pertama (flag belum ada) → purge sekali +
 * set flag; boot berikutnya → no-op total (DB live tidak disentuh).
 *
 * Flag HANYA di-set setelah `deleteDatabase` benar-benar selesai (`onsuccess`);
 * `onblocked` (koneksi lain masih terbuka) → JANGAN set flag, agar penurunan
 * token lama tetap dicoba lagi pada boot berikutnya (bukan klaim palsu).
 */
export function purgeLegacyDeviceTokenStore(): void {
  if (typeof indexedDB === "undefined") return;
  try {
    if (localStorage.getItem(MIGRATED_FLAG) === "1") return;
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => {
      try {
        localStorage.setItem(MIGRATED_FLAG, "1");
      } catch {
        // localStorage tak tersedia → DB sudah terhapus; flag opsional.
      }
    };
    // onblocked: ada koneksi (mis. tab lain) yang menahan → biarkan; akan
    // dicoba lagi boot berikutnya (flag belum di-set).
  } catch {
    // localStorage tak tersedia (mis. private mode) → jangan sentuh DB live.
  }
}

/**
 * Grace sebelum item yatim dibuang: 24 jam. Token bisa hilang sementara
 * (operator membersihkan storage, aktivasi ulang booth) dan foto pelanggan yang
 * belum tersinkron tidak boleh ikut hilang pada reload berikutnya — satu malam
 * event + hari berikutnya tetap tertahan.
 */
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Sapu item yatim — dipanggil setelah drain, saat antrian memang tidak bisa
 * dikirim lagi (tanpa token hidup).
 *
 * Aturan (Phase 6, lubang #4):
 * - Sesi `local_*` milik runtime lokal, bukan cloud: token device TIDAK
 *   dibutuhkan untuk menyelesaikannya, jadi tidak pernah disapu. Menyapunya
 *   berarti membuang foto pelanggan yang sebenarnya masih bisa disinkronkan.
 * - Sesi cloud dipertahankan sampai grace habis — reload singkat tidak lagi
 *   menghapus finalize yang belum terkirim.
 */
export async function purgeOrphaned(
  deviceToken: string | null,
  now: number = Date.now()
): Promise<void> {
  if (deviceToken) return;
  const items = await listQueued();
  for (const item of items) {
    if (item.sessionId.startsWith("local_")) continue;
    if (now - item.queuedAt < ORPHAN_GRACE_MS) continue;
    await removeQueued(item.sessionId);
  }
}

/**
 * Kontrak FormData endpoint finalize — SATU builder dipakai jalur online
 * (KioskApp) dan replay offline (syncOne) agar tidak drift.
 */
export function buildFinalizeForm(input: {
  deviceToken: string;
  templateId: string | null;
  retakeCount: number;
  photos: Blob[];
  /** Capture mentah tanpa frame — sumber GIF slideshow. */
  gifPhotos?: Blob[];
}): FormData {
  const form = new FormData();
  form.append("device_token", input.deviceToken);
  form.append("retake_count", String(input.retakeCount));
  if (input.templateId) form.append("template_id", input.templateId);
  for (const p of input.photos) form.append("photos", p, "photo.jpg");
  for (const p of input.gifPhotos ?? []) form.append("gif_photos", p, "gif-photo.jpg");
  return form;
}

/**
 * Kirim satu item antrian ke endpoint finalize; sukses → hapus dari antrian.
 * `deviceToken` diambil dari live state kiosk (BUKAN dipersist).
 */
export async function syncOne(item: QueuedFinalize, deviceToken: string | null): Promise<boolean> {
  // Sesi runtime lokal disinkronkan oleh worker runtime (Phase 7), bukan lewat
  // endpoint cloud — membuangnya di sini akan menghilangkan fotonya.
  if (item.sessionId.startsWith("local_")) return false;
  if (!deviceToken) {
    // Token hilang (reload penuh): biarkan di antrian. `purgeOrphaned` yang
    // memutuskan setelah grace habis — bukan jalur cepat yang menghapus foto.
    return false;
  }
  try {
    const res = await fetch(
      `/api/v1/public/${item.businessSlug}/sessions/${item.sessionId}/finalize`,
      {
        method: "POST",
        body: buildFinalizeForm({
          deviceToken,
          templateId: item.templateId,
          retakeCount: item.retakeCount,
          photos: item.photos,
          gifPhotos: item.gifPhotos,
        }),
      }
    );
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      // SESSION_EXPIRED permanen → buang (tidak akan pernah berhasil); lainnya retry nanti.
      if (res.status === 410 || json?.error?.code === "SESSION_EXPIRED") {
        await removeQueued(item.sessionId);
      }
      return false;
    }
    await removeQueued(item.sessionId);
    return true;
  } catch {
    // Network error (koneksi flap) → tetap di antrian, retry berikutnya.
    return false;
  }
}

/** Drain semua antrian berurutan (per-item catch — item gagal tidak memutus loop). */
export async function drainQueue(deviceToken: string | null): Promise<number> {
  const items = await listQueued();
  let synced = 0;
  for (const item of items) {
    if (await syncOne(item, deviceToken)) synced += 1;
  }
  return synced;
}
