/**
 * Loading shell kiosk — tampil seketika saat SSR masih berjalan.
 * Tanpa ini, booth menampilkan layar putih selama query config + presign.
 * Skeleton mengikuti komposisi layar welcome (brand kiri, CTA kanan).
 */
export default function KioskLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[100dvh] flex-col justify-center bg-bg px-5 py-10 text-ink md:px-8"
    >
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-12">
        <div className="flex flex-col items-center gap-4">
          <div className="h-16 w-40 animate-pulse border-2 border-ink/20 bg-muted md:h-24 md:w-56" />
          <div className="h-3 w-32 animate-pulse bg-muted" />
        </div>
        <div className="flex flex-col gap-4">
          <div className="h-3 w-28 animate-pulse bg-muted" />
          <div className="h-12 w-full max-w-[420px] animate-pulse bg-muted md:h-16" />
          <div className="h-4 w-full max-w-[360px] animate-pulse bg-muted" />
          <div className="mt-2 h-14 w-[220px] animate-pulse border-2 border-ink/20 bg-accent/40 md:h-16" />
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-[42ch] text-center text-[10px] uppercase leading-relaxed tracking-[0.14em] text-muted-foreground">
        Memuat konfigurasi booth. Jangan tutup layar.
      </p>
    </div>
  );
}
