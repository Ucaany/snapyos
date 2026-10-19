/**
 * Aturan shortcut kiosk, PURE (tanpa DOM/React) agar bisa di-unit-test.
 *
 * Dipakai `use-kiosk-lock.ts`. Dua keputusan dipisah supaya urutannya jelas:
 * shortcut keluar petugas diperiksa LEBIH DULU, baru shortcut yang diblokir.
 * Sebelumnya cabang `altKey` menelan `Ctrl+Alt+X`, sehingga satu-satunya
 * shortcut keluar tidak pernah tercapai.
 */

export type ShortcutEvent = {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

/** Tombol kedua untuk shortcut keluar petugas (Ctrl+Alt+X). */
export const EXIT_SHORTCUT_KEY = "x";

/** Ctrl+Alt+X (tahan 2 detik), satu-satunya jalan keluar via keyboard. */
export function isExitShortcut(e: ShortcutEvent): boolean {
  return Boolean(e.ctrlKey && e.altKey && e.key.toLowerCase() === EXIT_SHORTCUT_KEY);
}

/**
 * Shortcut yang harus dicegah selama kiosk terkunci:
 * - Escape/F11 keluar fullscreen
 * - Alt tunggal (Alt+Tab, Alt+F4 di Windows)
 * - Meta (Cmd+Tab, Cmd+W, Cmd+Q di macOS)
 * - Ctrl+W/N/T/R menutup atau mengganti tab
 * - Ctrl+Shift+I/J/C membuka DevTools
 *
 * Kombinasi Ctrl+Alt yang bukan shortcut keluar sengaja TIDAK diblokir:
 * di banyak layout AltGr dilaporkan sebagai Ctrl+Alt, dan memblokirnya
 * membuat karakter yang sah tidak bisa diketik.
 */
export function isBlockedShortcut(e: ShortcutEvent): boolean {
  if (e.key === "Escape" || e.key === "F11") return true;
  if (e.metaKey) return true;
  // Alt tunggal / Alt+Shift: pindah aplikasi atau menutup jendela.
  if (e.altKey && !e.ctrlKey) return true;
  const key = e.key.toLowerCase();
  if (e.ctrlKey && !e.altKey && ["w", "n", "t", "r"].includes(key)) return true;
  if (e.ctrlKey && e.shiftKey && !e.altKey && ["i", "j", "c"].includes(key)) return true;
  return false;
}
