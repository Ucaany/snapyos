import "server-only";
import type { Sharp } from "sharp";

/**
 * Filter server-side — padanan `marvinj` (PhotoboothProject) dan `pilgram2`
 * (photobooth-app) tanpa library tambahan.
 *
 * Satu sumber kebenaran ID filter: daftar di sini HARUS sama dengan
 * `FILTER_PRESETS` di `src/lib/kiosk-types.ts`, jadi filter yang ditambah di
 * klien tidak bisa diam-diam tidak dikenal server (dan sebaliknya).
 *
 * `filterPlan()` murni (tanpa sharp) supaya bisa diuji tanpa native binding;
 * `applyFilter()` yang menyentuh sharp.
 */

/** Urutan harus sejalan dengan FILTER_PRESETS (klien). */
export const FILTER_IDS = [
  "original",
  "film",
  "warm",
  "cool",
  "bw",
  "retro",
  "vintage",
  "y2k",
  "fade",
  "noir",
  "cyber",
  "lomo",
] as const;

export type FilterId = (typeof FILTER_IDS)[number];

export function isFilterId(value: unknown): value is FilterId {
  return typeof value === "string" && (FILTER_IDS as readonly string[]).includes(value);
}

/** Fallback aman: ID tak dikenal tidak pernah menjatuhkan render. */
export function normalizeFilterId(value: unknown): FilterId {
  return isFilterId(value) ? value : "original";
}

/** Matriks recomb 3×3 (baris = keluaran R/G/B, kolom = masukan R/G/B). */
export type RecombMatrix = readonly (readonly [number, number, number])[];

const IDENTITY: RecombMatrix = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Matriks sepia standar (rumus luminansi fotografi). */
const SEPIA: RecombMatrix = [
  [0.393, 0.769, 0.189],
  [0.349, 0.686, 0.168],
  [0.272, 0.534, 0.131],
];

/**
 * Campuran identitas ↔ sepia. `amount` 0 = tanpa perubahan, 1 = sepia penuh.
 * Ini pengganti `sepia(a)` pada CSS filter, yang tidak punya padanan langsung
 * di sharp.
 */
export function sepiaBlend(amount: number): RecombMatrix {
  const a = Math.min(1, Math.max(0, amount));
  return IDENTITY.map((row, y) =>
    row.map((value, x) => {
      const sepia = SEPIA[y]![x]!;
      // Dibulatkan 6 desimal agar hasil deterministik lintas platform.
      return Math.round(((1 - a) * value + a * sepia) * 1e6) / 1e6;
    })
  ) as unknown as RecombMatrix;
}

export type FilterPlan = {
  grayscale?: boolean;
  recomb?: RecombMatrix;
  modulate?: { brightness?: number; saturation?: number; hue?: number };
  linear?: { a: number; b: number };
};

/**
 * `contrast(c)` CSS → `linear(a, b)` sharp pada ruang 0..255:
 * titik netral 128 dipertahankan, jadi b = 128 × (1 − c).
 */
function contrastLinear(c: number): { a: number; b: number } {
  return { a: c, b: 128 * (1 - c) };
}

/**
 * Pemetaan preset klien (CSS) → operasi sharp. Nilai diambil apa adanya dari
 * `FILTER_PRESETS` supaya "Warm" di klien dan "Warm" di server sama maksudnya.
 */
export function filterPlan(id: FilterId): FilterPlan {
  switch (id) {
    case "film":
      return {
        modulate: { brightness: 1.02, saturation: 0.85 },
        linear: contrastLinear(1.05),
      };
    case "warm":
      return {
        recomb: sepiaBlend(0.25),
        modulate: { saturation: 1.2 },
      };
    case "cool":
      return { modulate: { hue: -10, saturation: 1.1 } };
    case "bw":
      return { grayscale: true, linear: contrastLinear(1.1) };
    case "retro":
      return {
        recomb: sepiaBlend(0.4),
        modulate: { saturation: 1.15 },
        linear: contrastLinear(1.1),
      };
    case "vintage":
      return {
        recomb: sepiaBlend(0.5),
        modulate: { brightness: 0.95 },
        linear: contrastLinear(0.95),
      };
    case "y2k":
      return {
        modulate: { brightness: 1.05, saturation: 1.6 },
        linear: contrastLinear(1.1),
      };
    case "fade":
      return {
        modulate: { brightness: 1.08, saturation: 0.9 },
        linear: contrastLinear(0.85),
      };
    case "noir":
      return {
        grayscale: true,
        modulate: { brightness: 0.92 },
        linear: contrastLinear(1.35),
      };
    case "cyber":
      return {
        modulate: { hue: 200, saturation: 1.5 },
        linear: contrastLinear(1.15),
      };
    case "lomo":
      return {
        modulate: { brightness: 0.95, saturation: 1.35 },
        linear: contrastLinear(1.2),
      };
    case "original":
    default:
      return {};
  }
}

/** Terapkan plan ke pipeline sharp (dipakai compose + route). */
export function applyFilterPlan(pipeline: Sharp, id: FilterId): Sharp {
  const plan = filterPlan(id);
  let out = pipeline;
  if (plan.grayscale) out = out.grayscale();
  if (plan.recomb) out = out.recomb(plan.recomb as Parameters<Sharp["recomb"]>[0]);
  if (plan.modulate) out = out.modulate(plan.modulate);
  if (plan.linear) out = out.linear(plan.linear.a, plan.linear.b);
  return out;
}

/**
 * Jalur berdiri sendiri (dipakai test dan pemanggil yang cuma punya buffer).
 * `failOn: "none"` mengikuti pola `frame/route.ts`: gambar rusak sebagian tetap
 * diproses daripada menggagalkan sesi pelanggan.
 */
export async function applyFilter(input: Buffer, id: FilterId): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const pipeline = sharp(input, { failOn: "none" });
  return applyFilterPlan(pipeline, id).jpeg({ quality: 92 }).toBuffer();
}
