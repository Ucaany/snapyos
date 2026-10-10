"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type QrisPollStatus = "paid" | "expired" | "pending";

/**
 * Polling status QRIS + countdown expiry + guard offline (docs/06 §6.8).
 * SATU protokol untuk kiosk checkout & pembayaran invoice (anti drift):
 * - poll tiap 3 detik, jeda saat offline (navigator.onLine)
 * - reconnect memicu cek status segera (recovery)
 * - final check tepat saat expiry; pending/offline tidak menandai expired —
 *   poll reconnect yang menyelesaikan
 *
 * `poll` melakukan transisi UI (settle/expired) sendiri dan mengembalikan
 * status final; hook berhenti menghitung saat status bukan "pending".
 *
 * Dipindah dari `src/lib/use-qris-polling.ts` (Fase 5) — hook client
 * murni sudah semestinya berada di `src/hooks/`.
 */
export function useQrisPolling(opts: {
  active: boolean;
  expiresAt: string | null;
  poll: () => Promise<QrisPollStatus>;
  /** Expiry tercapai dan status final bukan paid → QR dianggap hangus. */
  onExpired: () => void;
  intervalMs?: number;
}) {
  const { active, expiresAt, poll, onExpired, intervalMs = 3000 } = opts;
  const [left, setLeft] = useState(0);
  const [online, setOnline] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref callback — poll/onExpired boleh berubah tiap render tanpa restart timer.
  const pollCb = useRef(poll);
  const expiredCb = useRef(onExpired);
  useEffect(() => {
    pollCb.current = poll;
    expiredCb.current = onExpired;
  });

  const stopTimers = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
  }, []);

  // Status online/offline — defer agar setState tidak sinkron di body effect.
  useEffect(() => {
    const t = setTimeout(() => setOnline(navigator.onLine), 0);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  const runPoll = useCallback(() => {
    void pollCb
      .current()
      .then((s) => {
        if (s !== "pending") stopTimers();
      })
      .catch(() => {
        // Jaringan gagal → interval berikutnya / reconnect yang retry.
      });
  }, [stopTimers]);

  /** Cek status final sekali di waktu expiry — hanya tampilkan expired pada
   *  jawaban server definitif; offline → tunda ke poll reconnect. */
  const runFinalCheck = useCallback(() => {
    if (!navigator.onLine) return;
    void pollCb
      .current()
      .then((s) => {
        if (s === "paid") return;
        stopTimers();
        expiredCb.current();
      })
      .catch(() => undefined);
  }, [stopTimers]);

  // Timer hanya hidup selama fase QR; QR baru (expiresAt beda) restart bersih.
  useEffect(() => {
    if (!active) {
      stopTimers();
      return;
    }
    const remaining = expiresAt
      ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
      : 0;
    // Defer agar setState tidak sinkron di body effect (pola repo).
    const initT = setTimeout(() => setLeft(remaining), 0);
    pollRef.current = setInterval(() => {
      if (!navigator.onLine) return;
      runPoll();
    }, intervalMs);
    if (expiresAt) {
      tickRef.current = setInterval(() => {
        setLeft((prev) => (prev <= 1 ? 0 : prev - 1));
      }, 1000);
    }
    return () => {
      clearTimeout(initT);
      stopTimers();
    };
  }, [active, expiresAt, intervalMs, runPoll, stopTimers]);

  // Reconnect → cek status payment segera (recovery docs/06 §6.8).
  useEffect(() => {
    if (!online || !active) return;
    const t = setTimeout(runPoll, 0);
    return () => clearTimeout(t);
  }, [online, active, runPoll]);

  // Expiry tercapai → final check terjadwal tepat waktu (bukan tick-driven).
  useEffect(() => {
    if (!active || !expiresAt) return;
    const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    const t = setTimeout(runFinalCheck, delay);
    return () => clearTimeout(t);
  }, [active, expiresAt, runFinalCheck]);

  return { left, online, stopTimers };
}
