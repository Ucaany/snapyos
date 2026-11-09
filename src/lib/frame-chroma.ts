/**
 * Deteksi area hijau pada frame template, PURE (tanpa DOM/sharp) agar bisa
 * diuji langsung. Alur: mask hijau → komponen terhubung → kontur luar →
 * simplifikasi RDP → poligon slot di koordinat canvas (docs/15 §15.3).
 */

import { isGreenBackground } from "./chroma-key.ts";
import { MAX_SLOTS } from "./template-layout.ts";

export type Point = { x: number; y: number };

export type Component = {
  /** Jumlah piksel komponen. */
  pixels: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Indeks piksel pertama yang ditemukan (scan atas→bawah, kiri→kanan). */
  seed: number;
};

export type DetectedPolygon = {
  /** Titik poligon di koordinat canvas (bukan lokal slot). */
  points: Point[];
  /** Luas bbox poligon di koordinat canvas. */
  area: number;
};

export type DetectResult = {
  polygons: DetectedPolygon[];
  /** Komponen valid yang dibuang karena batas slot. */
  skipped: number;
};

/** 1 = piksel hijau (dan tidak transparan), selain itu 0. */
export function greenMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number
): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < mask.length; i += 1, p += 4) {
    if ((rgba[p + 3] ?? 0) === 0) continue;
    if (isGreenBackground([rgba[p] ?? 0, rgba[p + 1] ?? 0, rgba[p + 2] ?? 0])) {
      mask[i] = 1;
    }
  }
  return mask;
}

/** Komponen terhubung 8-neighbor, iteratif (tanpa rekursi). */
export function connectedComponents(
  mask: Uint8Array,
  width: number,
  height: number
): Component[] {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const components: Component[] = [];
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || seen[seed]) continue;
    let top = 0;
    stack[top++] = seed;
    seen[seed] = 1;
    const comp: Component = {
      pixels: 0,
      minX: width,
      minY: height,
      maxX: -1,
      maxY: -1,
      seed,
    };
    while (top > 0) {
      const index = stack[--top]!;
      const x = index % width;
      const y = (index - x) / width;
      comp.pixels += 1;
      if (x < comp.minX) comp.minX = x;
      if (y < comp.minY) comp.minY = y;
      if (x > comp.maxX) comp.maxX = x;
      if (y > comp.maxY) comp.maxY = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const n = ny * width + nx;
          if (!mask[n] || seen[n]) continue;
          seen[n] = 1;
          stack[top++] = n;
        }
      }
    }
    components.push(comp);
  }
  return components;
}

// Arah tetangga searah jarum jam (E, SE, S, SW, W, NW, N, NE).
const DIRS: readonly [number, number][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

function dirIndex(dx: number, dy: number): number {
  for (let d = 0; d < 8; d += 1) {
    if (DIRS[d]![0] === dx && DIRS[d]![1] === dy) return d;
  }
  return 0;
}

/**
 * Telusuri batas luar komponen (Moore-neighbor). Return titik piksel batas
 * tanpa duplikat penutup; titik pertama = pojok kiri-atas komponen.
 */
export function traceContour(
  mask: Uint8Array,
  width: number,
  height: number,
  component: Component
): Point[] {
  const isOn = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;

  const startX = component.minX;
  const startY = component.minY;
  const points: Point[] = [{ x: startX, y: startY }];
  let cx = startX;
  let cy = startY;
  // Backtrack awal: piksel di kiri start (di luar komponen karena start
  // adalah piksel paling atas lalu paling kiri).
  let backDir = dirIndex(-1, 0);

  let guard = width * height * 4 + 16;
  while (guard-- > 0) {
    let foundDir = -1;
    for (let k = 1; k <= 8; k += 1) {
      const d = (backDir + k) % 8;
      if (isOn(cx + DIRS[d]![0], cy + DIRS[d]![1])) {
        foundDir = d;
        break;
      }
    }
    if (foundDir < 0) break;
    const nx = cx + DIRS[foundDir]![0];
    const ny = cy + DIRS[foundDir]![1];
    backDir = (foundDir + 7) % 8;
    cx = nx;
    cy = ny;
    if (cx === startX && cy === startY) {
      // Kembali ke start dengan arah masuk yang sama = satu putaran penuh.
      if (backDir === dirIndex(-1, 0)) break;
      continue;
    }
    const last = points[points.length - 1]!;
    if (last.x !== cx || last.y !== cy) points.push({ x: cx, y: cy });
    if (points.length > 8192) break;
  }
  return points;
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Ramer–Douglas–Peucker iteratif (tanpa rekursi). */
export function simplifyPolygon(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const ranges: [number, number][] = [[0, points.length - 1]];
  while (ranges.length > 0) {
    const [first, last] = ranges.pop()!;
    let maxDist = 0;
    let maxIndex = -1;
    for (let i = first + 1; i < last; i += 1) {
      const dist = perpendicularDistance(points[i]!, points[first]!, points[last]!);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }
    if (maxIndex >= 0 && maxDist > tolerance) {
      keep[maxIndex] = 1;
      ranges.push([first, maxIndex], [maxIndex, last]);
    }
  }
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += 1) if (keep[i]) out.push({ ...points[i]! });
  return out;
}

/**
 * Deteksi slot dari area hijau frame.
 *
 * Koordinat masukan = piksel frame; keluaran = koordinat canvas (frame
 * digambar full-canvas oleh composeFrame, jadi rasionya
 * `canvasW/frameW` × `canvasH/frameH`).
 */
export function detectGreenSlots(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  canvasW: number,
  canvasH: number,
  maxSlots: number = MAX_SLOTS
): DetectResult {
  const mask = greenMask(rgba, width, height);
  const minArea = Math.max(1, Math.round(canvasW * canvasH * 0.001));
  const minSide = 8;
  const sx = canvasW / Math.max(1, width);
  const sy = canvasH / Math.max(1, height);
  const tolerance = Math.max(1.5, Math.min(canvasW, canvasH) * 0.002);

  const valid = connectedComponents(mask, width, height).filter((comp) => {
    const compW = comp.maxX - comp.minX + 1;
    const compH = comp.maxY - comp.minY + 1;
    if (compW < minSide || compH < minSide) return false;
    return compW * compH * sx * sy >= minArea;
  });

  valid.sort((a, b) => b.pixels - a.pixels);
  const chosen = valid.slice(0, Math.max(0, maxSlots));
  const skipped = Math.max(0, valid.length - chosen.length);

  // z mengikuti urutan atas→bawah lalu kiri→kanan (deterministik).
  chosen.sort((a, b) => a.minY - b.minY || a.minX - b.minX);

  const clampX = (value: number) => Math.min(canvasW, Math.max(0, value));
  const clampY = (value: number) => Math.min(canvasH, Math.max(0, value));

  const polygons: DetectedPolygon[] = chosen.map((comp) => {
    const contour = traceContour(mask, width, height, comp);
    const canvasPoints = contour.map((pt) => ({
      x: clampX((pt.x + 0.5) * sx),
      y: clampY((pt.y + 0.5) * sy),
    }));
    let simplified = simplifyPolygon(canvasPoints, tolerance);
    if (simplified.length < 3) {
      // Komponen terlalu kecil/sempit: pakai bbox sebagai poligon minimal.
      const left = clampX(comp.minX * sx);
      const top = clampY(comp.minY * sy);
      const right = clampX((comp.maxX + 1) * sx);
      const bottom = clampY((comp.maxY + 1) * sy);
      simplified = [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
      ];
    }
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const pt of simplified) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
    return { points: simplified, area: (maxX - minX) * (maxY - minY) };
  });

  return { polygons, skipped };
}
