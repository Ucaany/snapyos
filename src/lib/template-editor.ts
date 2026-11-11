/**
 * Geometri interaksi editor slot — MURNI (tanpa DOM) agar bisa diuji.
 * Dipakai builder: hit-test 8 handle, resize per handle, dan drag grup.
 */

import { clampSlot, type LayoutSlot } from "./template-layout.ts";

export const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
export type HandleId = (typeof HANDLES)[number];

export type HandlePoint = { id: HandleId; x: number; y: number };

/** 8 titik handle pada bbox slot (koordinat kanvas, bukan lokal rotasi). */
export function handlePoints(slot: LayoutSlot): HandlePoint[] {
  const { x, y, width, height } = slot;
  const midX = x + width / 2;
  const midY = y + height / 2;
  const right = x + width;
  const bottom = y + height;
  return [
    { id: "nw", x, y },
    { id: "n", x: midX, y },
    { id: "ne", x: right, y },
    { id: "e", x: right, y: midY },
    { id: "se", x: right, y: bottom },
    { id: "s", x: midX, y: bottom },
    { id: "sw", x, y: bottom },
    { id: "w", x, y: midY },
  ];
}

/** Handle terdekat dalam radius; null bila tidak ada yang kena. */
export function hitHandle(
  slot: LayoutSlot,
  px: number,
  py: number,
  tolerance: number
): HandleId | null {
  let best: { id: HandleId; distance: number } | null = null;
  for (const point of handlePoints(slot)) {
    const distance = Math.hypot(px - point.x, py - point.y);
    if (distance > tolerance) continue;
    if (!best || distance < best.distance) best = { id: point.id, distance };
  }
  return best?.id ?? null;
}

const movesLeft = (id: HandleId) => id === "nw" || id === "w" || id === "sw";
const movesRight = (id: HandleId) => id === "ne" || id === "e" || id === "se";
const movesTop = (id: HandleId) => id === "nw" || id === "n" || id === "ne";
const movesBottom = (id: HandleId) => id === "sw" || id === "s" || id === "se";

/**
 * Resize satu slot dari handle tertentu. Tepi berlawanan tetap diam, jadi
 * menyeret handle kiri mengubah x sekaligus width (bukan hanya width).
 */
export function resizeSlot(
  slot: LayoutSlot,
  handle: HandleId,
  deltaX: number,
  deltaY: number,
  canvas: { width: number; height: number },
  origin: { x: number; y: number; width: number; height: number }
): LayoutSlot {
  const left = origin.x;
  const top = origin.y;
  const right = origin.x + origin.width;
  const bottom = origin.y + origin.height;

  let nextLeft = left;
  let nextTop = top;
  let nextRight = right;
  let nextBottom = bottom;

  if (movesLeft(handle)) nextLeft = Math.min(right - 1, Math.max(0, left + deltaX));
  if (movesRight(handle)) nextRight = Math.max(left + 1, Math.min(canvas.width, right + deltaX));
  if (movesTop(handle)) nextTop = Math.min(bottom - 1, Math.max(0, top + deltaY));
  if (movesBottom(handle)) nextBottom = Math.max(top + 1, Math.min(canvas.height, bottom + deltaY));

  let width = nextRight - nextLeft;
  let height = nextBottom - nextTop;
  let x = nextLeft;
  let y = nextTop;

  // Circle wajib persegi: sisi terkecil, jangkar tepi yang tidak digeser.
  if (slot.shape === "circle") {
    const side = Math.max(1, Math.min(width, height));
    if (movesLeft(handle)) x = right - side;
    if (movesTop(handle)) y = bottom - side;
    width = side;
    height = side;
  }

  return clampSlot({ ...slot, x, y, width, height }, canvas);
}

/** Geser banyak slot sekaligus (drag grup) dengan clamp per slot. */
export function moveSlots(
  slots: readonly LayoutSlot[],
  ids: ReadonlySet<string>,
  deltaX: number,
  deltaY: number,
  canvas: { width: number; height: number },
  origins: ReadonlyMap<string, { x: number; y: number }>
): LayoutSlot[] {
  return slots.map((slot) => {
    if (!ids.has(slot.id)) return slot;
    const origin = origins.get(slot.id) ?? { x: slot.x, y: slot.y };
    return clampSlot({ ...slot, x: origin.x + deltaX, y: origin.y + deltaY }, canvas);
  });
}

/** Bbox gabungan beberapa slot — dipakai menggambar outline multi-select. */
export function unionBox(slots: readonly LayoutSlot[]): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} | null {
  if (slots.length === 0) return null;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const slot of slots) {
    left = Math.min(left, slot.x);
    top = Math.min(top, slot.y);
    right = Math.max(right, slot.x + slot.width);
    bottom = Math.max(bottom, slot.y + slot.height);
  }
  return { left, top, right, bottom };
}
