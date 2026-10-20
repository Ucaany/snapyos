"use client";

export default function PosError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-bg p-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        {"KESALAHAN SISTEM"}
      </p>
      <h1 className="font-display text-4xl uppercase tracking-tight">Terminal Error</h1>
      <p className="max-w-[50ch] font-mono text-sm leading-relaxed text-muted-foreground">
        {error.message || "Terjadi kesalahan pada terminal POS. Coba muat ulang halaman."}
      </p>
      {error.digest && (
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          REF {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="border-2 border-ink bg-accent px-6 py-3 font-mono text-sm font-bold uppercase tracking-[0.08em] shadow-[4px_4px_0_0_#111111] transition-transform active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
      >
        Coba Lagi
      </button>
    </div>
  );
}
