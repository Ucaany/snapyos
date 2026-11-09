"use client";

import { useEffect } from "react";

/** Daftarkan /sw.js sekali — syarat install prompt Chrome + shell offline kiosk. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      // persist() agar cache template tidak dibuang saat penyimpanan menipis.
      // Best-effort: browser boleh menolak tanpa mengganggu fungsionalitas.
      .then(() => navigator.storage?.persist?.())
      .catch(() => undefined);
  }, []);
  return null;
}
