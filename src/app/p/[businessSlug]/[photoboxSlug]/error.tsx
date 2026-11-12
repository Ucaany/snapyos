"use client";

import { RotateCcw } from "lucide-react";

/**
 * Error boundary route kiosk — gangguan sesaat (DB/storage) tidak boleh
 * menampilkan 404 "booth tidak ditemukan". Petugas mendapat satu aksi jelas.
 */
export default function KioskError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-bg px-5 py-10 text-center text-ink md:px-8">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
        {"BOOTH GAGAL DIMUAT"}
      </p>
      <h1 className="max-w-[16ch] font-display text-3xl uppercase leading-[0.95] tracking-[-0.02em] md:text-5xl">
        Coba muat ulang
      </h1>
      <p className="max-w-[48ch] text-sm leading-relaxed text-muted-foreground">
        Konfigurasi booth tidak bisa dimuat saat ini. Periksa koneksi internet booth, lalu muat
        ulang. Sesi foto yang sedang berjalan tidak hilang.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-14 items-center gap-2 border-2 border-ink bg-accent px-6 py-3 font-display text-base font-bold uppercase tracking-[-0.01em] shadow-hard transition-transform active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <RotateCcw className="size-5" aria-hidden />
        Muat ulang booth
      </button>
    </div>
  );
}
