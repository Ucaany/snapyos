"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null; retrying: boolean };

/**
 * Error boundary kiosk — auto-restart bila runtime error tak tertangani.
 * Menampilkan layar brutalist + menghitung mundur reload otomatis (kiosk
 * harus selalu hidup, bukan stuck di layar error). Reload memulihkan sesi
 * via verify (token tersimpan localStorage).
 */
export class KioskErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retrying: false };
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): State {
    return { error, retrying: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // ponytail: kirim error ke observability di kemudian hari; sekarang cukup log.
    console.error("[kiosk] runtime error:", error, info.componentStack);
    this.scheduleRestart();
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  scheduleRestart() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => window.location.reload(), 4000);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-bg p-6 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          {"/// KESALAHAN RUNTIME"}
        </p>
        <h1 className="font-display text-4xl uppercase leading-none tracking-tight md:text-5xl">
          Kiosk memuat ulang
        </h1>
        <p className="max-w-[52ch] font-mono text-xs uppercase leading-relaxed tracking-[0.08em] text-muted-foreground">
          Terjadi kesalahan tak terduga. Layar akan dimuat ulang otomatis dan
          sesi Anda dipulihkan.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="border-2 border-ink bg-accent px-6 py-3 font-display text-lg uppercase tracking-tight shadow-[4px_4px_0_0_#111111] transition-transform active:translate-y-[2px]"
        >
          Muat ulang sekarang
        </button>
      </div>
    );
  }
}
