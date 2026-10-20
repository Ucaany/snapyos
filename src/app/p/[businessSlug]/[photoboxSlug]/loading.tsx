/**
 * Loading shell kiosk — tampil seketika saat SSR masih berjalan.
 * Tanpa ini, booth menampilkan layar putih selama query config + presign.
 */
export default function KioskLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-bg px-6 text-center text-ink"
    >
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
        {"MENYIAPKAN BOOTH"}
      </p>
      <h1 className="font-display text-4xl uppercase leading-[0.95] tracking-tight md:text-6xl">
        Sebentar
      </h1>
      <div aria-hidden className="h-2 w-48 border-2 border-ink bg-surface">
        <div className="h-full w-1/3 animate-pulse bg-accent" />
      </div>
      <p className="max-w-[42ch] font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Memuat konfigurasi booth. Jangan tutup layar.
      </p>
    </div>
  );
}
