"use client";

import type { PublicTemplate } from "@/lib/kiosk-types";

/**
 * Preload frame di luar jalur tampil.
 *
 * Grid pilih frame hanya butuh thumbnail; frame PNG penuh baru dibutuhkan
 * editor/preview. Preload dijalankan setelah halaman interaktif
 * (`requestIdleCallback`) dan saat kartu dipilih, sehingga tidak ada render
 * frame dingin yang memblokir layar.
 */

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

function whenIdle(run: () => void): () => void {
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(run, { timeout: 2000 });
    return () => {
      const cancel = (w as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      cancel?.(id);
    };
  }
  const timer = setTimeout(run, 200);
  return () => clearTimeout(timer);
}

/** Preload satu gambar; resolve null bila gagal (bukan error yang dilempar). */
export function preloadFrameAsset(url: string, signal?: AbortSignal): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve(null);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    signal?.addEventListener(
      "abort",
      () => {
        img.src = "";
        resolve(null);
      },
      { once: true }
    );
    img.src = url;
  });
}

/**
 * Preload frame penuh semua template yang thumbnail-nya sudah tampil.
 * Dibatalkan saat komponen unmount supaya tidak membuang bandwidth sesi
 * yang sudah berganti layar.
 */
export function preloadFrameAssets(templates: PublicTemplate[], signal?: AbortSignal): () => void {
  let cancelled = false;
  const cancelIdle = whenIdle(() => {
    for (const template of templates) {
      if (cancelled || signal?.aborted) return;
      // `file_url` = proxy frame penuh. Tidak di-await: semua berjalan paralel
      // dan hasilnya tinggal di HTTP cache browser untuk editor.
      void preloadFrameAsset(template.file_url, signal);
    }
  });
  return () => {
    cancelled = true;
    cancelIdle();
  };
}
