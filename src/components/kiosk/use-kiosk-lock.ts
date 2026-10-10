"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceProfile } from "@/lib/device-profile";

/**
 * Kiosk fullscreen lock — layar terkunci penuh setelah setup. Keluar hanya via
 * PIN petugas (diverifikasi server, diatur owner di dashboard).
 *
 * - Desktop: Ctrl+Alt+X tahan 2 detik → minta PIN.
 * - Tablet/sentuh: tap-tahan 3 detik di overlay re-engage → minta PIN.
 * - Fullscreen: Escape/F11 diblokir; auto re-engage setiap kali keluar
 *   fullscreen (gestur pertama memicu requestFullscreen ulang).
 * - Orientasi: dikunci per booth (`screen_orientation`) via Screen Orientation
 *   API bila tersedia (Chrome Android/desktop); iOS PWA mengikuti manifest.
 * - iOS (iPad/iPhone): `requestFullscreen` tidak didukung — lock mengandalkan
 *   PWA `standalone` + blokir gestur (tanpa fullscreen). Lihat device-profile.
 *
 * Keluar TIDAK me-reset state — sesi berjalan tetap utuh (tidak reload).
 */

const EXIT_HOLD_MS = 2000;
const TOUCH_EXIT_HOLD_MS = 3000;

export function useKioskLock(
  active: boolean,
  orientation: "landscape" | "portrait" | undefined,
  onExitRequest?: () => void
) {
  const [reengage, setReengage] = useState(false);
  const unlockedRef = useRef(false);
  const holdStartRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const requestFullscreen = useCallback(() => {
    if (unlockedRef.current) return;
    // iOS/iPadOS tidak dukung fullscreen — tidak perlu re-engage.
    if (!getDeviceProfile().supportsFullscreen) {
      setReengage(false);
      return;
    }
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().then(
        () => setReengage(false),
        () => {
          // Tanpa user gesture — tunggu interaksi pertama untuk retry.
          setReengage(true);
        }
      );
    }
  }, []);

  const clearHold = useCallback(() => {
    holdStartRef.current = null;
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const lockOrientation = useCallback((target: string) => {
    // Screen Orientation API — Chrome/Android; iOS PWA pakai manifest.
    // iPad/iPhone tidak dukung lock runtime — no-op.
    if (!getDeviceProfile().supportsFullscreen) return Promise.resolve();
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (so && typeof so.lock === "function") return so.lock(target);
    return Promise.resolve();
  }, []);

  /** Keluar dari mode kiosk — hanya dipanggil setelah PIN diverifikasi. */
  const unlock = useCallback(() => {
    clearHold();
    unlockedRef.current = true;
    setReengage(false);
    if (document.fullscreenElement) void document.exitFullscreen();
    void lockOrientation("any").catch(() => undefined);
  }, [clearHold, lockOrientation]);

  // Aktifkan lock + pasang semua penjaga.
  useEffect(() => {
    if (!active || unlockedRef.current) return;

    requestFullscreen();

    // Orientasi layar per booth (landscape/portrait). Default landscape.
    const target =
      orientation === "portrait" ? "portrait-primary" : "landscape-primary";
    void lockOrientation(target).catch(() => undefined);

    // Tablet (iPad/Android PWA): blokir swipe-navigasi + overscroll tanpa
    // fullscreen — lock mengandalkan PWA standalone + tap-tahan PIN.
    const root = document.documentElement;
    const prevTouchAction = root.style.touchAction;
    const prevOverscroll = root.style.overscrollBehavior;
    root.style.touchAction = "pan-x pan-y";
    root.style.overscrollBehavior = "none";

    const onKeyDown = (e: KeyboardEvent) => {
      if (unlockedRef.current) return;
      // Blokir keluar fullscreen standar.
      if (e.key === "Escape" || e.key === "F11") {
        e.preventDefault();
        return;
      }
      // Blokir Alt+Tab / Ctrl+W / Ctrl+N / Ctrl+T (keluar kiosk tanpa PIN).
      if (e.altKey || (e.ctrlKey && ["w", "n", "t", "r"].includes(e.key.toLowerCase()))) {
        e.preventDefault();
        return;
      }
      // Shortcut petugas: Ctrl+Alt+X 2 detik → minta PIN keluar (bukan unlock
      // langsung — PIN diverifikasi server sebelum kiosk benar-benar keluar).
      if (e.ctrlKey && e.altKey && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        if (holdStartRef.current === null) {
          holdStartRef.current = Date.now();
          holdTimerRef.current = setInterval(() => {
            if (holdStartRef.current && Date.now() - holdStartRef.current >= EXIT_HOLD_MS) {
              clearHold();
              onExitRequest?.();
            }
          }, 100);
        }
        return;
      }
      clearHold();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "x" || e.key === "X") clearHold();
    };

    const onFullscreenChange = () => {
      if (unlockedRef.current) return;
      // Keluar fullscreen (di luar jalur unlock) → tandai re-engage.
      setReengage(!document.fullscreenElement);
    };

    const onVisibilityChange = () => {
      if (unlockedRef.current) return;
      // Tab terlihat lagi tapi sudah tidak fullscreen → coba re-lock.
      if (document.visibilityState === "visible" && !document.fullscreenElement) {
        requestFullscreen();
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      if (!unlockedRef.current) e.preventDefault();
    };

    // Gestur pertama di mana pun mencoba fullscreen ulang bila belum aktif
    // (kecuali iOS yang tidak dukung fullscreen).
    const onPointerDown = () => {
      if (!unlockedRef.current && !document.fullscreenElement && getDeviceProfile().supportsFullscreen) {
        requestFullscreen();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      clearHold();
      root.style.touchAction = prevTouchAction;
      root.style.overscrollBehavior = prevOverscroll;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [active, orientation, clearHold, requestFullscreen, lockOrientation, onExitRequest]);

  return { reengage, requestFullscreen, unlock };
}

// Tombol petugas — tahan 3 detik via pointer events (mouse + sentuh; touch
// events saja tidak fire di desktop, klik kiri pun bisa memicu PIN).
export function useHoldExit(onExitRequest?: () => void) {
  const startRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    startRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(() => {
    clear();
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      if (startRef.current && Date.now() - startRef.current >= TOUCH_EXIT_HOLD_MS) {
        clear();
        onExitRequest?.();
      }
    }, 100);
  }, [clear, onExitRequest]);

  return { onPointerDown, onPointerUp: clear, onPointerLeave: clear, onPointerCancel: clear };
}
