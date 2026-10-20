"use client";

/**
 * Device profile — deteksi kelas perangkat kiosk mobile (iPad / tablet Android /
 * Android phone / iPhone). Satu PWA, empat kelas perangkat; fitur (kamera, fullscreen,
 * orientasi, print) berbeda per kelas, bukan engine terpisah.
 *
 * Deteksi memakai gabungan: `navigator.userAgent`, `navigator.maxTouchPoints`,
 * `screen.width/height`, dan `matchMedia('(display-mode: standalone)')`.
 *
 * Catatan keamanan: `userAgent` bisa di-spoof — hasil ini hanya UX hint. Keputusan
 * runtime sebenarnya (kamera/orientasi) tetap dicek capability (bukan UA).
 */

export type DeviceKind =
  "ipad" | "tablet-android" | "phone-android" | "phone-ios" | "desktop" | "unknown";

export type DeviceProfile = {
  kind: DeviceKind;
  /** Perangkat sentuh (touchscreen) — semua mobile + iPad. */
  isTouch: boolean;
  /** Layar lebar (tablet/iPad/desktop) vs sempit (phone). */
  isTablet: boolean;
  isPhone: boolean;
  /** iOS / iPadOS (Safari WebKit). */
  isIos: boolean;
  isAndroid: boolean;
  /** PWA terpasang (standalone) — bukan tab browser biasa. */
  isPwaInstalled: boolean;
  /** `requestFullscreen` & Screen Orientation lock didukung (Android Chrome; bukan iOS). */
  supportsFullscreen: boolean;
  /** Orientasi default yang direkomendasikan per kelas. */
  defaultOrientation: "landscape" | "portrait";
  /** Kamera default: belakang (environment) untuk kiosk, depan (user) untuk selfie. */
  defaultFacingMode: "environment" | "user";
  /** Print langsung didukung (tablet/iPad) vs digital-only (phone). */
  supportsPrint: boolean;
};

const IOS_UA = /ipad|iphone|ipod/i;
const ANDROID_UA = /android/i;

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return IOS_UA.test(navigator.userAgent) && !ANDROID_UA.test(navigator.userAgent);
}

function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return ANDROID_UA.test(navigator.userAgent);
}

/** iPadOS 13+ menyamar sebagai Macintosh di UA — deteksi via maxTouchPoints. */
function isIpad(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/ipad/i.test(ua)) return true;
  // iPadOS desktop-class: Mac UA + layar sentuh multi-titik.
  return /macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

function isPwaInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari standalone.
    (typeof navigator !== "undefined" &&
      (navigator as unknown as { standalone?: boolean }).standalone === true)
  );
}

/** Lebar layar terpendek (CSS px) — klasifikasi tablet vs phone (portrait/landscape agnostik). */
function screenWidth(): number {
  if (typeof screen === "undefined") return 0;
  return Math.min(screen.width, screen.height);
}

export function detectDeviceKind(): DeviceKind {
  if (isIpad()) return "ipad";
  if (isAndroid()) {
    return screenWidth() >= 768 ? "tablet-android" : "phone-android";
  }
  if (isIos()) return "phone-ios";
  // Desktop / non-mobile.
  return "desktop";
}

export function getDeviceProfile(): DeviceProfile {
  const kind = detectDeviceKind();

  const isIosDevice = kind === "ipad" || kind === "phone-ios";
  const isAndroidDevice = kind === "tablet-android" || kind === "phone-android";
  const isTablet = kind === "ipad" || kind === "tablet-android";
  const isPhone = kind === "phone-android" || kind === "phone-ios";

  return {
    kind,
    isTouch: isIosDevice || isAndroidDevice,
    isTablet,
    isPhone,
    isIos: isIosDevice,
    isAndroid: isAndroidDevice,
    isPwaInstalled: isPwaInstalled(),
    // iOS Safari tidak dukung requestFullscreen; Android Chrome dukung.
    supportsFullscreen: isAndroidDevice,
    defaultOrientation: isPhone ? "portrait" : "landscape",
    // Kiosk tablet = kamera belakang (kualitas); phone selfie = kamera depan.
    defaultFacingMode: isPhone ? "user" : "environment",
    // Desktop/mini PC kiosk (docs/05) mencetak lewat printer OS dengan flag
    // Chrome --kiosk-printing; hanya ponsel yang tidak mencetak langsung.
    supportsPrint: isTablet || kind === "desktop",
  };
}
