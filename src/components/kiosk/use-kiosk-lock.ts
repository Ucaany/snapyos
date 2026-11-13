"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceProfile } from "@/lib/device-profile";
import { isBlockedShortcut, isExitShortcut } from "@/lib/kiosk-lock";

/**
 * Kiosk fullscreen lock — layar terkunci penuh setelah setup. Keluar hanya via
 * PIN petugas (diverifikasi server, diatur owner di dashboard).
 *
 * - Desktop: Ctrl+Alt+X tahan 2 detik → minta PIN.
 * - Tablet/sentuh: tap-tahan 3 detik di tombol petugas → minta PIN.
 * - Fullscreen: Escape/F11 diblokir; auto re-engage setiap kali keluar
 *   fullscreen (gestur pertama memicu requestFullscreen ulang).
 * - Orientasi: dikunci per booth (`screen_orientation`) via Screen Orientation
 *   API bila tersedia (Chrome Android/desktop); iOS PWA mengikuti manifest.
 * - iOS (iPad/iPhone): `requestFullscreen` tidak didukung — lock mengandalkan
 *   PWA `standalone` + blokir gestur (tanpa fullscreen). Lihat device-profile.
 * - `enabled` = `camera_settings.fullscreen !== false`: bila owner mematikan
 *   fullscreen, hook tetap mengunci orientasi dan shortcut, tetapi tidak
 *   memaksa fullscreen atau memasang overlay re-engage.
 *
 * Keluar TIDAK me-reset state — sesi berjalan tetap utuh (tidak reload).
 */

const EXIT_HOLD_MS = 2000;
const TOUCH_EXIT_HOLD_MS = 3000;
/** Flag sesi: petugas sudah keluar — overlay re-engage tidak boleh muncul lagi. */
const UNLOCKED_SESSION_KEY = "snapyos_kiosk_unlocked";

function alreadyUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCKED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markUnlocked(): void {
  try {
    sessionStorage.setItem(UNLOCKED_SESSION_KEY, "1");
  } catch {
    /* private mode / storage penuh: state memori tetap jadi sumber kebenaran */
  }
}

function clearUnlocked(): void {
  try {
    sessionStorage.removeItem(UNLOCKED_SESSION_KEY);
  } catch {
    /* private mode / storage penuh: state memori tetap jadi sumber kebenaran */
  }
}

export function useKioskLock(
  active: boolean,
  orientation: "landscape" | "portrait" | undefined,
  onExitRequest?: () => void,
  /** `camera_settings.fullscreen`; false = jangan paksa fullscreen. */
  fullscreenEnabled = true
) {
  const [reengage, setReengage] = useState(false);
  // Naik saat relock: memaksa effect memasang ulang penjaga bila sebelumnya
  // dilewati karena sesi ini sudah pernah di-unlock.
  const [lockEpoch, setLockEpoch] = useState(0);
  const unlockedRef = useRef(false);
  const holdStartRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guard: requestFullscreen masih menunggu jawaban → fullscreenchange yang
  // datang di tengah jalan bukan berarti petugas keluar kiosk.
  const requestingRef = useRef(false);
  // Fullscreen pernah benar-benar aktif. Overlay re-engage hanya untuk
  // kehilangan fullscreen yang nyata; bila request pertama ditolak (iframe,
  // kebijakan browser, tanpa gesture) jangan kunci layar — retry diam-diam
  // pada gestur berikutnya (onPointerDown).
  const hadFullscreenRef = useRef(false);

  const requestFullscreen = useCallback(() => {
    if (unlockedRef.current) return;
    if (!fullscreenEnabled) {
      setReengage(false);
      return;
    }
    // iOS/iPadOS tidak dukung fullscreen — tidak perlu re-engage.
    if (!getDeviceProfile().supportsFullscreen) {
      setReengage(false);
      return;
    }
    const el = document.documentElement;
    if (el.requestFullscreen) {
      requestingRef.current = true;
      el.requestFullscreen().then(
        () => {
          requestingRef.current = false;
          hadFullscreenRef.current = true;
          setReengage(false);
        },
        () => {
          requestingRef.current = false;
          // Tanpa user gesture / ditolak browser — jangan kunci layar; gestur
          // berikutnya mencoba lagi (lihat onPointerDown).
          setReengage(hadFullscreenRef.current);
        }
      );
    }
  }, [fullscreenEnabled]);

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
    markUnlocked();
    setReengage(false);
    if (document.fullscreenElement) void document.exitFullscreen();
    void lockOrientation("any").catch(() => undefined);
  }, [clearHold, lockOrientation]);

  /**
   * Kunci ulang di awal sesi customer. Dipanggil dari handler klik (gesture
   * nyata) supaya `requestFullscreen` tidak ditolak browser. Menghapus flag
   * unlock supaya reload berikutnya juga kembali terkunci.
   */
  const relock = useCallback(() => {
    clearHold();
    unlockedRef.current = false;
    hadFullscreenRef.current = false;
    clearUnlocked();
    setReengage(false);
    setLockEpoch((n) => n + 1);
    requestFullscreen();
  }, [clearHold, requestFullscreen]);

  // Aktifkan lock + pasang semua penjaga.
  useEffect(() => {
    if (!active || unlockedRef.current || alreadyUnlocked()) return;

    // Defer: requestFullscreen bisa men-set state (reengage) — jangan sinkron
    // di body effect (memicu cascading render).
    if (fullscreenEnabled) void Promise.resolve().then(() => requestFullscreen());

    // Orientasi layar per booth (landscape/portrait). Default landscape.
    const target = orientation === "portrait" ? "portrait-primary" : "landscape-primary";
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
      // Keyboard fisik (mini PC) juga gestur sah: pulihkan fullscreen sebelum
      // shortcut diproses, supaya PIN/setelan tidak pernah tampil jendela.
      if (
        !requestingRef.current &&
        !document.fullscreenElement &&
        getDeviceProfile().supportsFullscreen
      ) {
        requestFullscreen();
      }
      // Shortcut keluar diperiksa SEBELUM blokir — Ctrl+Alt+X juga cocok
      // dengan aturan "altKey" dan dulu tertelan oleh cabang blokir.
      if (isExitShortcut(e)) {
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
      if (isBlockedShortcut(e)) {
        e.preventDefault();
        clearHold();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "x") clearHold();
    };

    const onFullscreenChange = () => {
      if (unlockedRef.current || requestingRef.current) return;
      if (document.fullscreenElement) hadFullscreenRef.current = true;
      // Keluar fullscreen (di luar jalur unlock) → tandai re-engage hanya bila
      // fullscreen memang pernah aktif; kegagalan awal bukan "terkunci".
      setReengage(!document.fullscreenElement && hadFullscreenRef.current);
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
      if (
        !unlockedRef.current &&
        !requestingRef.current &&
        !document.fullscreenElement &&
        getDeviceProfile().supportsFullscreen
      ) {
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
  }, [
    active,
    orientation,
    clearHold,
    requestFullscreen,
    lockOrientation,
    onExitRequest,
    fullscreenEnabled,
    lockEpoch,
  ]);

  return { reengage, requestFullscreen, unlock, relock };
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
