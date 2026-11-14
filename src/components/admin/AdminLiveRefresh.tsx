"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/admin/ui/button";
import { cn } from "@/lib/utils";

function subscribeVisibility(listener: () => void) {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

/**
 * Segarkan data server tiap `intervalMs` selama tab terlihat. Dipakai halaman
 * yang menampilkan heartbeat booth: status online berubah tanpa reload manual.
 */
export function AdminLiveRefresh({
  intervalMs = 15_000,
  label = "Data live",
  className,
}: {
  intervalMs?: number;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [paused, setPaused] = useState(false);
  const visible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true
  );

  useEffect(() => {
    if (!visible || paused) return;
    const tick = setInterval(() => setSecondsAgo((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [visible, paused]);

  useEffect(() => {
    if (!visible || paused) return;
    const refresh = setInterval(() => {
      router.refresh();
      setSecondsAgo(0);
    }, intervalMs);
    return () => clearInterval(refresh);
  }, [router, intervalMs, visible, paused]);

  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <span aria-live="polite" className="tabular-nums">
        {label} · {secondsAgo}s lalu
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-9 gap-1.5 px-2"
        onClick={() => {
          router.refresh();
          setSecondsAgo(0);
        }}
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
        Segarkan
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-9 px-2"
        aria-pressed={paused}
        onClick={() => setPaused((p) => !p)}
      >
        {paused ? "Lanjutkan" : "Jeda"}
      </Button>
    </div>
  );
}
