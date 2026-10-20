"use client";

/**
 * Widget Cloudflare Turnstile (docs/08 §8.18).
 * - `siteKey` kosong → render null (dev tanpa key; server juga skip).
 * - Cloudflare meng-inject hidden input `cf-turnstile-response` sendiri saat
 *   render; jangan menambah input manual (FormData akan membawa dua nilai).
 * - Mode JSON (dengan `onToken`): token dikirim ke pemanggil via callback.
 * - `ref.reset()` → minta token baru (Turnstile token single-use; panggil
 *   sebelum tiap POST supaya request kedua tidak ditolak `timeout-or-duplicate`).
 */

import Script from "next/script";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

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

export type TurnstileStatus = "idle" | "loading" | "verified" | "error";

/**
 * Batas tunggu token Turnstile. Cloudflare normal menyelesaikan challenge
 * dalam <5 detik; bila callback tidak datang (jaringan booth mati, domain
 * diblokir, `timeout-or-duplicate`) kita menyerah dengan token "" alih-alih
 * menggantung selamanya.
 * ponytail: 8 detik cukup untuk booth; naikkan bila jaringan lapangan lambat.
 */
const RESET_TIMEOUT_MS = 8_000;
/** Challenge yang tidak selesai (DNS/jaringan) tidak selalu memanggil error-callback. */
const LOAD_TIMEOUT_MS = 12_000;

type Props = {
  siteKey: string;
  /** Mode JSON: dipanggil tiap token baru/expired ("" saat expired). */
  onToken?: (token: string) => void;
  /** Status verifikasi (true=token siap, false=expired/error). Untuk gate submit. */
  onVerified?: (verified: boolean) => void;
  /** Status rinci untuk pesan UI (mis. challenge gagal karena domain salah). */
  onStatus?: (status: TurnstileStatus) => void;
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

export function TurnstileWidget({
  siteKey,
  onToken,
  onVerified,
  onStatus,
  action = "turnstile",
  className,
  ref,
}: Props & { ref?: React.Ref<TurnstileHandle> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const tokenRef = useRef("");
  const waiters = useRef<((token: string) => void)[]>([]);
  // reset() dipanggil sebelum widget ter-render → reset ditunda ke efek render.
  const pendingResetRef = useRef(false);
  const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ready, setReady] = useState(false);

  // Simpan callback di ref → efek tidak ikut re-render saat parent re-render
  // (Finding: onToken inline bikin widget di-teardown tiap render).
  const onTokenRef = useRef(onToken);
  const onVerifiedRef = useRef(onVerified);
  const onStatusRef = useRef(onStatus);

  useEffect(() => {
    onTokenRef.current = onToken;
    onVerifiedRef.current = onVerified;
    onStatusRef.current = onStatus;
  }, [onToken, onVerified, onStatus]);

  function setStatus(status: TurnstileStatus) {
    onStatusRef.current?.(status);
  }

  const deliver = useCallback((token: string) => {
    if (loadTimerRef.current) {
      clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
    tokenRef.current = token;
    onTokenRef.current?.(token);
    onVerifiedRef.current?.(Boolean(token));
    setStatus(token ? "verified" : "idle");
    const pending = waiters.current;
    waiters.current = [];
    for (const resolve of pending) resolve(token);
  }, []);

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
        setStatus("loading");
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
    setStatus("loading");
    if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
    loadTimerRef.current = setTimeout(() => {
      if (tokenRef.current) return;
      deliver("");
      setStatus("error");
      loadTimerRef.current = null;
    }, LOAD_TIMEOUT_MS);
    widgetId.current = window.turnstile.render(el, {
      sitekey: siteKey,
      action,
      callback: deliver,
      "expired-callback": () => {
        deliver("");
        setStatus("idle");
      },
      "error-callback": () => {
        deliver("");
        setStatus("error");
      },
    });
    if (pendingResetRef.current) {
      pendingResetRef.current = false;
      window.turnstile.reset(widgetId.current);
    }
    return () => {
      if (loadTimerRef.current) {
        clearTimeout(loadTimerRef.current);
        loadTimerRef.current = null;
      }
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, ready, action, deliver]);

  if (!siteKey) return null;

  return (
    <div className={className}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div ref={containerRef} />
    </div>
  );
}
