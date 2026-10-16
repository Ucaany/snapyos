"use client";

/**
 * Widget Cloudflare Turnstile (docs/08 §8.18).
 * - `siteKey` kosong → render null (dev tanpa key; server juga skip).
 * - Mode form (tanpa `onToken`): widget meng-inject hidden input
 *   `cf-turnstile-response` sendiri, jadi cukup diletakkan di dalam <form>.
 * - Mode JSON (dengan `onToken`): token dikirim ke pemanggil via callback.
 * - `ref.reset()` → minta token baru (Turnstile token single-use; panggil
 *   sebelum tiap POST supaya request kedua tidak ditolak `timeout-or-duplicate`).
 */

import Script from "next/script";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type TurnstileHandle = {
  /** Token terbaru ("" sebelum challenge selesai). */
  token(): string;
  /**
   * Buang token lama & minta challenge baru; resolve saat token siap.
   * Resolve "" bila challenge tak selesai dalam batas waktu (widget tak
   * termuat / callback tidak pernah datang) — JANGAN menggantung selamanya,
   * supaya pemanggil bisa lanjut/menampilkan error alih-alih spinner abadi.
   */
  reset(): Promise<string>;
};

/**
 * Batas tunggu token Turnstile. Cloudflare normal menyelesaikan challenge
 * dalam <5 detik; bila callback tidak datang (jaringan booth mati, domain
 * diblokir, `timeout-or-duplicate`) kita menyerah dengan token "" alih-alih
 * menggantung selamanya.
 * ponytail: 8 detik cukup untuk booth; naikkan bila jaringan lapangan lambat.
 */
const RESET_TIMEOUT_MS = 8_000;

type Props = {
  siteKey: string;
  /** Mode JSON: dipanggil tiap token baru/expired ("" saat expired). */
  onToken?: (token: string) => void;
  /** Status verifikasi (true=token siap, false=expired/error). Untuk gate submit. */
  onVerified?: (verified: boolean) => void;
  action?: string;
  className?: string;
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          action?: string;
        }
      ) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

export const TurnstileWidget = forwardRef<TurnstileHandle, Props>(
  function TurnstileWidget({ siteKey, onToken, onVerified, action = "turnstile", className }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const hiddenRef = useRef<HTMLInputElement>(null);
    const widgetId = useRef<string | null>(null);
    const tokenRef = useRef("");
    const waiters = useRef<((token: string) => void)[]>([]);
    // reset() dipanggil sebelum widget ter-render → reset ditunda ke efek render.
    const pendingResetRef = useRef(false);
    const [ready, setReady] = useState(false);

    // Simpan callback di ref → efek tidak ikut re-render saat parent re-render
    // (Finding: onToken inline bikin widget di-teardown tiap render).
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;
    const onVerifiedRef = useRef(onVerified);
    onVerifiedRef.current = onVerified;

    function deliver(token: string) {
      tokenRef.current = token;
      // Mode form: tulis ke hidden input (uncontrolled) → FormData bawa token.
      if (hiddenRef.current) hiddenRef.current.value = token;
      onTokenRef.current?.(token);
      onVerifiedRef.current?.(Boolean(token));
      const pending = waiters.current;
      waiters.current = [];
      for (const resolve of pending) resolve(token);
    }

    useImperativeHandle(ref, () => ({
      token: () => tokenRef.current,
      /**
       * Minta token baru. TIDAK resolve "" hanya karena widget belum siap:
       * tunggu sampai widget ter-render lalu challenge selesai (di-batasi
       * RESET_TIMEOUT_MS). Ini krusial di produksi — `load()` checkout
       * memanggil reset() saat mount, sering SEBELUM script Turnstile selesai
       * dimuat; early-return "" membuat POST pertama selalu CAPTCHA_FAILED.
       */
      reset: () =>
        new Promise<string>((resolve) => {
          tokenRef.current = "";
          // Token lama sudah dibuang → beri tahu pemanggil supaya gate submit
          // menutup kembali sampai challenge baru selesai (jangan biarkan
          // tombol aktif dengan token yang sudah dikonsumsi server).
          onVerifiedRef.current?.(false);
          let done = false;
          const timer: ReturnType<typeof setTimeout> = setTimeout(() => finish(""), RESET_TIMEOUT_MS);
          function finish(token: string) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(token);
          }
          waiters.current.push(finish);
          if (window.turnstile && widgetId.current) {
            window.turnstile.reset(widgetId.current);
          } else {
            // Widget belum ada — tandai; render effect akan reset begitu siap.
            pendingResetRef.current = true;
          }
        }),
    }));

    useEffect(() => {
      if (!siteKey || !ready) return;
      const el = containerRef.current;
      if (!el || !window.turnstile) return;
      widgetId.current = window.turnstile.render(el, {
        sitekey: siteKey,
        action,
        callback: deliver,
        "expired-callback": () => deliver(""),
        "error-callback": () => deliver(""),
      });
      if (pendingResetRef.current) {
        pendingResetRef.current = false;
        window.turnstile.reset(widgetId.current);
      }
      return () => {
        if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      };
    }, [siteKey, ready, action]);

    if (!siteKey) return null;

    return (
      <div className={className}>
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setReady(true)}
        />
        <div ref={containerRef} />
        {/* Mode form: hidden input dikelola widget sendiri (explicit render tidak
            meng-inject otomatis). Diabaikan server bila mode JSON yang dipakai. */}
        {!onToken && (
          <input ref={hiddenRef} type="hidden" name="cf-turnstile-response" defaultValue="" />
        )}
      </div>
    );
  }
);
