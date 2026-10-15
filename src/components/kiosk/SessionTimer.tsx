"use client";

import { useEffect, useRef, useState } from "react";
import { remainingSeconds, isWarning } from "@/lib/session-timer";

type Props = {
  expiresAt: string;
  warningSeconds: number;
  onExpired: () => void;
};

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Session timer — docs/05 §5.1b (countdown client = UX; server = enforcer). */
export function SessionTimer({ expiresAt, warningSeconds, onExpired }: Props) {
  const [left, setLeft] = useState(() => remainingSeconds(expiresAt));
  const fired = useRef(false);

  useEffect(() => {
    const tick = () => {
      const s = remainingSeconds(expiresAt);
      setLeft(s);
      if (s <= 0 && !fired.current) {
        fired.current = true;
        onExpired();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpired]);

  const warning = isWarning(expiresAt, warningSeconds);

  return (
    <div
      className={`inline-flex items-center gap-2 border-2 border-ink px-3 py-1.5 font-mono text-sm font-bold shadow-[2px_2px_0_0_#111111] ${
        warning ? "bg-destructive text-ink" : "bg-bg text-ink"
      }`}
      role="timer"
      aria-live={warning ? "polite" : "off"}
    >
      <span className="text-[10px] uppercase tracking-[0.2em]">
        {warning ? "Sisa · SEGERA" : "Sisa"}
      </span>
      {fmt(left)}
    </div>
  );
}
