/**
 * Deteksi EXE kiosk (Tauri v2 / WebView2).
 *
 * Kiosk browser dan EXE memakai halaman yang sama; hanya beberapa API browser
 * yang tidak berlaku di WebView2 (rotasi layar, Web Bluetooth). Satu tempat
 * untuk menanyakannya, bukan `window.__TAURI__` yang tersebar di banyak file.
 *
 * Tiga penanda diperiksa karena injeksi `__TAURI__` bergantung pada
 * `withGlobalTauri` dan pada apakah origin diizinkan capability: EXE menulis
 * `__SNAPYOS_EXE__` lewat initialization script Rust, jadi penanda itu selalu
 * ada di halaman yang dimuat EXE.
 */

type TauriWindow = Window & {
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
  __SNAPYOS_EXE__?: unknown;
};

export function isKioskExe(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as TauriWindow;
  return Boolean(w.__SNAPYOS_EXE__ || w.__TAURI__ || w.__TAURI_INTERNALS__);
}
