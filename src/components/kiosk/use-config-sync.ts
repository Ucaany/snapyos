"use client";

import { useEffect, useState } from "react";
import type { PublicConfig } from "@/lib/kiosk-types";

/**
 * Live config kiosk. Poll 3s dengan If-None-Match: server mengembalikan 304
 * (tanpa body, tanpa presign R2) bila config tak berubah → setConfig dihindari
 * dan render subtree tak terpicu. Poll dijeda saat tab tersembunyi (document
 * hidden) dan langsung refresh sekali saat kembali terlihat (visibilitychange).
 */
export function useConfigSync(
  initial: PublicConfig,
  businessSlug: string,
  photoboxSlug: string,
  enabled: boolean
): PublicConfig {
  const [config, setConfig] = useState(initial);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    // ETag terakhir — pertahankan lintas tick; undefined = belum ketahuan.
    let etag: string | null = null;

    const refresh = async () => {
      try {
        const res = await fetch(
          `/api/v1/public/${businessSlug}?photobox=${encodeURIComponent(photoboxSlug)}`,
          { headers: etag ? { "If-None-Match": etag } : undefined }
        );
        if (res.status === 304) return;
        if (!res.ok) return;
        const json = (await res.json()) as { data: PublicConfig };
        etag = res.headers.get("etag");
        if (!alive || !json.data) return;
        setConfig((prev) => (prev.etag === json.data.etag ? prev : json.data));
      } catch {
        /* offline/jaringan — tick berikutnya mencoba lagi */
      }
    };

    const start = () => {
      if (timer) return;
      void refresh();
      timer = setInterval(() => void refresh(), 3000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [businessSlug, enabled, photoboxSlug]);

  return config;
}
