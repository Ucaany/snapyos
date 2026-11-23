"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { KioskAction } from "@/components/kiosk/ui";

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
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
          {"KESALAHAN RUNTIME"}
        </p>
        <h1 className="max-w-[18ch] font-display text-3xl uppercase leading-none tracking-[-0.02em] md:text-4xl">
          Kiosk perlu dimuat ulang
        </h1>
        <p className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
          Terjadi kesalahan tak terduga. Muat ulang untuk memulihkan sesi yang tersimpan.
        </p>
        <KioskAction
          tone="primary"
          size="lg"
          onClick={() => window.location.reload()}
        >
          Muat ulang sekarang
        </KioskAction>
      </div>
    );
  }
}
