"use client";

/**
 * Detak board operasional /staff: jam stasiun + elapsed/sisa sesi.
 *
 * SSR hanya mengirim satu timestamp; tanpa komponen ini angka "LIVE" dan
 * "SISA x MIN" beku sampai halaman dimuat ulang (board shift berjalan
 * berjam-jam). Tick 15 detik cukup karena yang tampil menit, bukan detik;
 * `visibilitychange` menyusul saat tab kembali aktif karena interval di
 * tab latar di-throttle browser.
 */

import { useEffect, useState } from "react";

import { clockParts, elapsedMinutes, remainingMinutes, sessionProgressPct } from "@/lib/staff-live";

const TICK_MS = 15_000;

function useNowMs(initialMs: number): number {
  const [nowMs, setNowMs] = useState(initialMs);
  useEffect(() => {
    const sync = () => setNowMs(Date.now());
    const id = setInterval(sync, TICK_MS);
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  return nowMs;
}

/** Jam stasiun + label zona bisnis (WIB/WITA/WIT mengikuti timezone bisnis). */
export function StationClock({ initialMs, timeZone }: { initialMs: number; timeZone: string }) {
  const nowMs = useNowMs(initialMs);
  const { time, zone } = clockParts(nowMs, timeZone);
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
      <span className="size-2 bg-accent shadow-[0_0_0_2px_#111111]" aria-hidden />
      <span className="text-ink">LIVE</span>
      <span aria-hidden>·</span>
      <time dateTime={new Date(nowMs).toISOString()}>
        {time} {zone}
      </time>
    </div>
  );
}

/** Baris MULAI / elapsed / sisa + bar progres sesi, ikut berjalan. */
export function LiveSessionMeta({
  startedAt,
  expiresAt,
  startedLabel,
  initialMs,
}: {
  startedAt: string;
  expiresAt: string | null;
  /** Jam mulai sudah diformat server (statis) pada zona bisnis. */
  startedLabel: string;
  initialMs: number;
}) {
  const nowMs = useNowMs(initialMs);
  const minutes = elapsedMinutes(startedAt, nowMs);
  const pct = sessionProgressPct(startedAt, expiresAt, nowMs);
  const remainingMin = remainingMinutes(expiresAt, nowMs);

  return (
    <>
      <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        <span>MULAI {startedLabel}</span>
        <span className="text-ink">
          {minutes} MIN
          {remainingMin !== null ? ` · SISA ${remainingMin} MIN` : ""}
        </span>
      </div>
      {pct !== null && (
        <div className="mt-2 h-2 border-2 border-ink bg-surface">
          <div className="h-full bg-accent" style={{ width: `${pct}%` }} aria-hidden />
        </div>
      )}
    </>
  );
}
