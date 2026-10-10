"use client";

import { useEffect, useMemo } from "react";

/**
 * Object URL stabil dari Blob — DOM memakai `blob:` (bukan base64 data URL
 * besar di state+DOM). URL dibuat sekali per blob (di-cache WeakMap) lalu
 * di-revoke saat blob tak lagi dipakai komponen / unmount.
 */

/** Cache per-blob → { url, refs }. WeakMap agar blob yang dilepas bisa di-GC. */
const registry = new WeakMap<Blob, { url: string; refs: number }>();

function acquire(blob: Blob): string {
  const existing = registry.get(blob);
  if (existing) {
    existing.refs += 1;
    return existing.url;
  }
  const url = URL.createObjectURL(blob);
  registry.set(blob, { url, refs: 1 });
  return url;
}

function release(blob: Blob): void {
  const entry = registry.get(blob);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    URL.revokeObjectURL(entry.url);
    registry.delete(blob);
  }
}

export function useObjectUrl(blob: Blob | null | undefined): string | null {
  // URL diperoleh saat render (bukan setState dalam effect) → tak memicu
  // cascading render. Ref-count di WeakMap menjaga URL hidup selama dipakai.
  const url = useMemo(() => (blob ? acquire(blob) : null), [blob]);
  useEffect(() => {
    if (!blob) return;
    return () => release(blob);
  }, [blob]);
  return url;
}

/** Object URL untuk daftar Blob (mis. banyak lembar cetak). */
export function useObjectUrls(blobs: Blob[]): (string | null)[] {
  const key = blobs.join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const urls = useMemo(() => blobs.map((b) => acquire(b)), [key]);
  useEffect(() => {
    // `blobs` pada render ini dipegang closure → rilis set yang benar.
    const snapshot = blobs;
    return () => {
      for (const b of snapshot) release(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}
