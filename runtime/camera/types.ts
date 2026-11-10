/**
 * Kontrak adapter kamera.
 *
 * Satu aturan yang tidak boleh dilanggar: kegagalan `preview()` tidak pernah
 * membatalkan `capture()`. Preview hanya untuk layar; foto yang sudah tertangkap
 * adalah uang pelanggan.
 */

import type { CameraKind } from "../config.ts";

export type CameraStatus = {
  adapter: CameraKind;
  connected: boolean;
  mock: boolean;
  model?: string;
  last_error?: string;
};

/** `id` = token yang bisa dipakai memilih perangkat (path/index/port). */
export type CameraInfo = { id: string; label: string };

export type CameraAdapter = {
  readonly kind: CameraKind;
  readonly mock: boolean;
  /** Deteksi read-only; tidak membuka perangkat. */
  list(): Promise<CameraInfo[]>;
  status(): Promise<CameraStatus>;
  preview(): Promise<Buffer>;
  capture(): Promise<Buffer>;
};

/** JPEG utuh: SOI di depan, EOI di belakang. */
export function isJpeg(body: Buffer): boolean {
  return (
    body.length >= 4 &&
    body[0] === 0xff &&
    body[1] === 0xd8 &&
    body[body.length - 2] === 0xff &&
    body[body.length - 1] === 0xd9
  );
}
