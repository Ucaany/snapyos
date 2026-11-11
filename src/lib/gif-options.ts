/**
 * Parameter GIF hasil sesi — PURE (tanpa DOM/server-only) agar dipakai bersama
 * `business_settings.output.gif` (zod) dan encoder server, dan bisa diuji
 * langsung di node:test. Rentang sama dengan `gifOutputSettingsSchema`.
 */

export const GIF_MIN_WIDTH = 240;
export const GIF_MAX_WIDTH = 1080;
export const GIF_MIN_FRAME_DELAY_MS = 100;
export const GIF_MAX_FRAME_DELAY_MS = 3000;

export const GIF_DEFAULT_MAX_WIDTH = 480;
export const GIF_DEFAULT_FRAME_DELAY_MS = 800;

export type GifOptions = {
  /** Delay antar frame (ms), 100–3000. */
  frameDelayMs?: number;
  /** Lebar maksimum output (px), 240–1080. */
  maxWidth?: number;
};

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

/** Acuan encoder: nilai di luar rentang di-clamp, bukan melempar — setelan
 *  lama/rusak tidak boleh mematikan output digital customer. */
export function resolveGifOptions(opts: GifOptions = {}): {
  maxWidth: number;
  frameDelayMs: number;
} {
  return {
    maxWidth: clampInt(opts.maxWidth, GIF_MIN_WIDTH, GIF_MAX_WIDTH, GIF_DEFAULT_MAX_WIDTH),
    frameDelayMs: clampInt(
      opts.frameDelayMs,
      GIF_MIN_FRAME_DELAY_MS,
      GIF_MAX_FRAME_DELAY_MS,
      GIF_DEFAULT_FRAME_DELAY_MS
    ),
  };
}
