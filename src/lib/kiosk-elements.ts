/**
 * Katalog elemen kiosk per layar + helper baca/resolve.
 * Murni tipe (tanpa "server-only") agar bisa diimpor komponen client.
 */

import type { CSSProperties } from "react";
import type { KioskPageId } from "./kiosk-types.ts";

/** Konfigurasi satu elemen kiosk (semua opsional — default mengikuti layar). */
export type KioskElementConfig = {
  visible?: boolean;
  order?: number;
  offset_x?: number;
  offset_y?: number;
  text?: string;
};
export type KioskElementsConfig = Record<string, KioskElementConfig>;
export type KioskElementDef = { id: string; label: string };

/** Batas nilai agar owner tidak bisa memindahkan elemen keluar layar. */
const ORDER_MIN = 0;
const ORDER_MAX = 50;
const OFFSET_LIMIT = 400;
const TEXT_MAX = 120;
const ELEMENT_ID = /^[a-z_]{1,32}$/;
const MAX_ENTRIES = 32;

/** Daftar elemen yang bisa dikustomisasi per layar (id stabil, jangan diubah). */
export const KIOSK_ELEMENTS: Record<KioskPageId, readonly KioskElementDef[]> = {
  welcome: [
    { id: "logo", label: "Logo" },
    { id: "business", label: "Nama bisnis" },
    { id: "eyebrow", label: "Label kecil" },
    { id: "title", label: "Judul" },
    { id: "tagline", label: "Tagline" },
    { id: "cta", label: "Tombol mulai" },
  ],
  guide: [
    { id: "eyebrow", label: "Label kecil" },
    { id: "title", label: "Judul" },
    { id: "hint", label: "Teks bantuan" },
    { id: "back", label: "Tombol kembali" },
    { id: "steps", label: "Langkah" },
    { id: "cta", label: "Tombol mulai" },
    { id: "footer", label: "Catatan bawah" },
  ],
  package: [
    { id: "eyebrow", label: "Label kecil" },
    { id: "title", label: "Judul" },
    { id: "hint", label: "Teks bantuan" },
    { id: "back", label: "Tombol kembali" },
    { id: "empty", label: "Pesan kosong" },
    { id: "grid", label: "Daftar paket" },
  ],
  template: [
    { id: "eyebrow", label: "Label kecil" },
    { id: "title", label: "Judul" },
    { id: "hint", label: "Teks bantuan" },
    { id: "info", label: "Info frame" },
    { id: "grid", label: "Daftar frame" },
    { id: "confirm", label: "Panel konfirmasi" },
  ],
  payment: [
    { id: "eyebrow", label: "Label kecil" },
    { id: "title", label: "Judul" },
    { id: "hint", label: "Teks bantuan" },
    { id: "back", label: "Tombol kembali" },
    { id: "summary", label: "Ringkasan pesanan" },
    { id: "methods", label: "Metode pembayaran" },
  ],
  capture: [
    { id: "eyebrow", label: "Label kecil" },
    { id: "title", label: "Judul" },
    { id: "hint", label: "Teks bantuan" },
    { id: "frame", label: "Preview frame" },
    { id: "cta", label: "Tombol ambil foto" },
    { id: "mirror", label: "Tombol mirror" },
    { id: "auto", label: "Kontrol otomatis" },
    { id: "filters", label: "Filter" },
    { id: "progress", label: "Progres foto" },
    { id: "review", label: "Aksi ulang/lanjut" },
  ],
  edit: [
    { id: "eyebrow", label: "Label kecil" },
    { id: "title", label: "Judul" },
    { id: "hint", label: "Teks bantuan" },
    { id: "selector", label: "Pilih foto" },
    { id: "canvas", label: "Kanvas" },
    { id: "filters", label: "Filter" },
    { id: "rotate", label: "Rotasi" },
    { id: "adjust", label: "Penyesuaian" },
    { id: "stickers", label: "Stiker" },
    { id: "text", label: "Teks" },
    { id: "finish", label: "Tombol selesai" },
  ],
  result: [
    { id: "eyebrow", label: "Label kecil" },
    { id: "title", label: "Judul" },
    { id: "hint", label: "Teks bantuan" },
    { id: "photos", label: "Grid foto" },
    { id: "gif", label: "GIF" },
    { id: "status", label: "Status & QR" },
    { id: "actions", label: "Tombol aksi" },
  ],
};

/** Daftar elemen satu layar; layar tak dikenal = kosong. */
export function kioskElementDefs(page: KioskPageId): readonly KioskElementDef[] {
  return KIOSK_ELEMENTS[page] ?? [];
}

/** Teks override elemen, fallback ke teks bawaan layar. */
export function kioskElementText(
  elements: KioskElementsConfig | undefined,
  id: string,
  fallback: string
): string {
  const text = elements?.[id]?.text;
  if (typeof text !== "string") return fallback;
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed.slice(0, TEXT_MAX) : fallback;
}

function clampInt(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Resolusi elemen: hidden dari `visible`, urutan + geser dari config.
 * `display` TIDAK di-set — komponen memakai atribut `hidden` agar aksesibilitas
 * dan state layar tetap benar.
 */
export function resolveKioskElement(
  elements: KioskElementsConfig | undefined,
  id: string,
  defaultOrder: number
): { hidden: boolean; order: number; style: CSSProperties } {
  const cfg = elements?.[id];
  const hidden = cfg?.visible === false;
  const order = clampInt(cfg?.order, ORDER_MIN, ORDER_MAX) ?? defaultOrder;
  const offsetX = clampInt(cfg?.offset_x, -OFFSET_LIMIT, OFFSET_LIMIT) ?? 0;
  const offsetY = clampInt(cfg?.offset_y, -OFFSET_LIMIT, OFFSET_LIMIT) ?? 0;
  const style: CSSProperties = { order };
  if (offsetX !== 0 || offsetY !== 0) {
    style.transform = `translate(${offsetX}px, ${offsetY}px)`;
  }
  return { hidden, order, style };
}

/** Sanitasi generik config elemen dari jsonb / input klien. */
export function normalizeKioskElements(input: unknown): KioskElementsConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: KioskElementsConfig = {};
  let count = 0;
  for (const [id, raw] of Object.entries(input as Record<string, unknown>)) {
    if (count >= MAX_ENTRIES) break;
    if (!ELEMENT_ID.test(id)) continue;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const entry: KioskElementConfig = {};
    if (typeof row.visible === "boolean") entry.visible = row.visible;
    const order = clampInt(row.order, ORDER_MIN, ORDER_MAX);
    if (order !== undefined) entry.order = order;
    const offsetX = clampInt(row.offset_x, -OFFSET_LIMIT, OFFSET_LIMIT);
    if (offsetX !== undefined) entry.offset_x = offsetX;
    const offsetY = clampInt(row.offset_y, -OFFSET_LIMIT, OFFSET_LIMIT);
    if (offsetY !== undefined) entry.offset_y = offsetY;
    if (typeof row.text === "string") {
      const text = row.text.trim().slice(0, TEXT_MAX);
      if (text.length > 0) entry.text = text;
    }
    if (Object.keys(entry).length === 0) continue;
    out[id] = entry;
    count += 1;
  }
  return out;
}
