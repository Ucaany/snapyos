"use client";

import { RotateCcw } from "lucide-react";

/**
 * Error boundary route kiosk — gangguan sesaat (DB/storage) tidak boleh
 * menampilkan 404 "booth tidak ditemukan". Petugas mendapat satu aksi jelas.
 */
export default function KioskError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-bg px-6 py-10 text-center text-ink">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
        {"BOOTH GAGAL DIMUAT"}
      </p>
      <h1 className="font-display text-4xl uppercase leading-[0.95] tracking-tight md:text-6xl">
        Coba muat ulang
      </h1>
      <p className="max-w-[48ch] font-mono text-xs uppercase leading-relaxed tracking-[0.08em] text-muted-foreground">
        Konfigurasi booth tidak bisa dimuat saat ini. Periksa koneksi internet booth, lalu muat
        ulang. Sesi foto yang sedang berjalan tidak hilang.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-14 items-center gap-2 border-2 border-ink bg-accent px-6 py-3 font-display text-lg uppercase tracking-tight shadow-[4px_4px_0_0_#111111] transition-transform active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <RotateCcw className="size-5" aria-hidden />
        Muat ulang booth
      </button>
    </div>
  );
}
