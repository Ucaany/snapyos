"use client";

import { useSyncExternalStore } from "react";

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * Jam live WIB. Snapshot berupa detik supaya identitas stabil per detik; SSR
 * mengirim 0 (spacer) agar tidak ada hydration mismatch.
 */
let currentSecond = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function tick() {
  currentSecond = Math.floor(Date.now() / 1000);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    tick();
    timer = setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function useCurrentSecond() {
  return useSyncExternalStore(
    subscribe,
    () => currentSecond,
    () => 0
  );
}

export function AdminClock() {
  const second = useCurrentSecond();

  if (!second) {
    return <div className="h-9 w-44" aria-hidden="true" />;
  }

  const now = new Date(second * 1000);

  return (
    <time
      dateTime={now.toISOString()}
      className="flex h-9 flex-col items-end justify-center leading-tight"
    >
      <span className="hidden text-xs text-muted-foreground sm:block">
        {dateFormatter.format(now)}
      </span>
      <span className="text-sm font-medium tabular-nums">
        {timeFormatter.format(now)}
        <span className="ml-1 text-xs font-normal text-muted-foreground">WIB</span>
      </span>
    </time>
  );
}
