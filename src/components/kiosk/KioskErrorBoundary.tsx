"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null; retrying: boolean };

/**
 * Error boundary kiosk — menampilkan layar pemulihan saat runtime error tak
 * tertangani. Reload sengaja manual: auto-reload berulang menyembunyikan
 * penyebab error dan membuat booth tidak bisa dipakai.
 */
export class KioskErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retrying: false };

  static getDerivedStateFromError(error: Error): State {
    return { error, retrying: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // ponytail: kirim error ke observability di kemudian hari; sekarang cukup log.
    console.error("[kiosk] runtime error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-bg p-6 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {"/// KESALAHAN RUNTIME"}
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight md:text-5xl">
          Kiosk perlu dimuat ulang
        </h1>
        <p className="max-w-[52ch] font-mono text-xs uppercase leading-relaxed tracking-[0.08em] text-muted-foreground">
          Terjadi kesalahan tak terduga. Muat ulang untuk memulihkan sesi yang tersimpan.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 border-2 border-ink bg-accent px-6 py-3 font-display text-lg uppercase tracking-tight shadow-[4px_4px_0_0_#111111] transition-transform active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Muat ulang sekarang
        </button>
      </div>
    );
  }
}
