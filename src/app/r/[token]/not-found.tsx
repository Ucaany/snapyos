import Link from "next/link";

/**
 * 404 khusus segmen /r — pesan actionable tanpa membocorkan token.
 * Token tidak pernah ditampilkan di sini agar link kedaluwarsa tidak
 * menjadi petunjuk enumerasi.
 */
export default function ResultNotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-bg p-6 text-center text-ink">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
        HASIL TIDAK TERSEDIA
      </p>
      <h1 className="font-display text-4xl uppercase leading-[0.95] tracking-tight md:text-5xl">
        Link kedaluwarsa
      </h1>
      <p className="max-w-[52ch] font-mono text-sm leading-relaxed text-muted-foreground">
        Link hasil foto sudah kedaluwarsa atau tidak ditemukan. Hubungi petugas booth untuk
        mendapatkan salinan foto kamu.
      </p>
      <Link
        href="/"
        className="border-2 border-ink bg-accent px-6 py-3 font-mono text-sm font-bold uppercase tracking-[0.08em] shadow-hard transition-transform active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
      >
        Ke Beranda
      </Link>
    </div>
  );
}
