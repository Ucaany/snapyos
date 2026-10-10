import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-bg p-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {"/// ERROR 404"}
      </p>
      <h1 className="font-display text-6xl uppercase tracking-tight">404</h1>
      <p className="max-w-[50ch] font-mono text-sm leading-relaxed text-muted-foreground">
        Halaman yang Anda cari tidak ditemukan atau sudah dipindahkan.
      </p>
      <Link
        href="/"
        className="border-2 border-ink bg-accent px-6 py-3 font-mono text-sm font-bold uppercase tracking-[0.08em] shadow-[4px_4px_0_0_#111111] transition-transform active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
      >
        Ke Beranda
      </Link>
    </div>
  );
}
