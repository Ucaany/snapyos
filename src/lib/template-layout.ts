/**
 * Template layout contract — docs/15 §15.2.
 * Murni (zod + math, tanpa "server-only") agar bisa dipakai oleh:
 * server validation, builder dashboard, kiosk editor, dan unit test.
 */

import { z } from "zod";

export const CANVAS_PRESETS = {
  "4x6-portrait": { width: 1200, height: 1800 },
  "4x6-landscape": { width: 1800, height: 1200 },
  "2x6-strip": { width: 600, height: 1800 },
  square: { width: 1500, height: 1500 },
} as const;

export type CanvasPreset = keyof typeof CANVAS_PRESETS | "custom";
export const CANVAS_MAX = 3000;
export const MAX_SLOTS = 8;

/** Toleransi float untuk perbandingan geometri (preset/circle/AABB). */
const EPS = 0.01;

/**
 * Warna dasar di bawah foto. Wajib ada karena chroma key menghapus piksel
 * (alpha 0) sementara output final disimpan sebagai JPEG — tanpa isian dasar,
 * lubang transparan itu tercetak hitam.
 */
export const DEFAULT_CANVAS_BACKGROUND = "#ffffff";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const SLOT_SHAPES = ["rect", "rounded", "circle", "ellipse"] as const;
export const SLOT_FITS = ["cover", "contain", "fill"] as const;
export const PROPERTY_FONT_WEIGHTS = [400, 500, 600, 700, 800, 900] as const;
export const PROPERTY_ALIGNMENTS = ["left", "center", "right"] as const;
export const PROPERTY_OVERFLOW = ["visible", "hidden", "clip"] as const;

export const editorPropertySchema = z.object({
  text: z.string().max(2000).optional(),
  fontFamily: z.enum(["display", "sans", "mono"]).optional(),
  fontSize: z.number().min(8).max(240).optional(),
  fontWeight: z.number().int().refine((value) => PROPERTY_FONT_WEIGHTS.includes(value as never)).optional(),
  lineHeight: z.number().min(0.8).max(3).optional(),
  letterSpacing: z.number().min(-0.2).max(2).optional(),
  color: z.string().regex(HEX_COLOR).optional(),
  background: z.string().regex(HEX_COLOR).optional(),
  opacity: z.number().min(0).max(1).optional(),
  crop: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) }).optional(),
  fit: z.enum(["cover", "contain", "fill"]).optional(),
  poster: z.string().trim().max(500).nullable().optional(),
  autoplay: z.boolean().optional(),
  loop: z.boolean().optional(),
  muted: z.boolean().optional(),
  alignment: z.enum(PROPERTY_ALIGNMENTS).optional(),
  maxWidth: z.number().min(1).max(CANVAS_MAX).optional(),
  overflow: z.enum(PROPERTY_OVERFLOW).optional(),
});

export type EditorProperties = z.infer<typeof editorPropertySchema>;

const slotSchema = z.object({
  id: z.string().trim().min(1).max(40),
  shape: z.enum(SLOT_SHAPES),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number().min(-180).max(180),
  radius: z.number().min(0).optional(),
  fit: z.enum(SLOT_FITS).optional(),
  z: z.number().int().min(0).max(99),
  /**
   * properties tidak dirender oleh composeFrame; disimpan untuk kompatibilitas
   * data lama (editor lama/dashboard) dan tidak boleh mempengaruhi render.
   */
  properties: editorPropertySchema.optional(),
});

/**
 * Layout jsonb contract (trust boundary — docs/15 §15.2):
 * slot harus berada sepenuhnya di dalam canvas, ukuran > 0, max 8 slot,
 * id unik, z unik & rapat 0..n-1, preset cocok dengan dimensi canvas.
 */
export const layoutSchema = z
  .object({
    version: z.literal(1),
    canvas: z.object({
      width: z.number().int().min(1).max(CANVAS_MAX),
      height: z.number().int().min(1).max(CANVAS_MAX),
      preset: z.string().trim().min(1).max(32),
      /** Warna dasar di bawah foto (hex 6 digit). Kosong = putih. */
      background: z.string().regex(HEX_COLOR, "background harus hex #rrggbb").optional(),
    }),
    slots: z.array(slotSchema).max(MAX_SLOTS),
  })
  .superRefine((layout, ctx) => {
    const { width: W, height: H, preset } = layout.canvas;

    // Preset harus cocok dengan dimensi canvas (selain "custom").
    if (preset !== "custom") {
      const dims = (CANVAS_PRESETS as Record<string, { width: number; height: number } | undefined>)[preset];
      if (!dims || dims.width !== W || dims.height !== H) {
        ctx.addIssue({
          code: "custom",
          path: ["canvas", "preset"],
          message: "preset tidak cocok dengan dimensi canvas",
        });
      }
    }

    const idSeen = new Set<string>();
    layout.slots.forEach((slot, i) => {
      // Invariant 1: id slot unik.
      if (idSeen.has(slot.id)) {
        ctx.addIssue({ code: "custom", path: ["slots", i, "id"], message: "id slot duplikat" });
      } else {
        idSeen.add(slot.id);
      }

      if (slot.width <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["slots", i, "width"],
          message: "width slot harus > 0",
        });
      }
      if (slot.height <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["slots", i, "height"],
          message: "height slot harus > 0",
        });
      }
      if (slot.x < 0) {
        ctx.addIssue({
          code: "custom",
          path: ["slots", i, "x"],
          message: "x slot tidak boleh < 0",
        });
      }
      if (slot.y < 0) {
        ctx.addIssue({
          code: "custom",
          path: ["slots", i, "y"],
          message: "y slot tidak boleh < 0",
        });
      }

      // Invariant 4: radius tidak boleh melebihi setengah sisi terpendek.
      if (slot.radius !== undefined && slot.radius > Math.min(slot.width, slot.height) / 2 + EPS) {
        ctx.addIssue({
          code: "custom",
          path: ["slots", i, "radius"],
          message: "radius melebihi setengah sisi terpendek",
        });
      }

      // Invariant 5: circle wajib persegi (ellipse bebas rasio).
      if (slot.shape === "circle" && Math.abs(slot.width - slot.height) > EPS) {
        ctx.addIssue({
          code: "custom",
          path: ["slots", i, "height"],
          message: "shape circle wajib persegi (width = height)",
        });
      }

      // Invariant 7: crop harus berada di dalam [0,1].
      const crop = slot.properties?.crop;
      if (crop) {
        if (crop.width <= 0) {
          ctx.addIssue({
            code: "custom",
            path: ["slots", i, "properties", "crop", "width"],
            message: "width crop harus > 0",
          });
        }
        if (crop.height <= 0) {
          ctx.addIssue({
            code: "custom",
            path: ["slots", i, "properties", "crop", "height"],
            message: "height crop harus > 0",
          });
        }
        if (crop.x + crop.width > 1 + EPS) {
          ctx.addIssue({
            code: "custom",
            path: ["slots", i, "properties", "crop", "width"],
            message: "crop melebihi batas kanan (x + width > 1)",
          });
        }
        if (crop.y + crop.height > 1 + EPS) {
          ctx.addIssue({
            code: "custom",
            path: ["slots", i, "properties", "crop", "height"],
            message: "crop melebihi batas bawah (y + height > 1)",
          });
        }
      }

      // Invariant 6: bounds rotation-aware (AABB hasil rotasi harus di dalam canvas).
      const box = slotAabb(slot);
      if (box.left < -EPS || box.top < -EPS || box.right > W + EPS || box.bottom > H + EPS) {
        const rotated = Math.abs(slot.rotation % 360) > EPS;
        ctx.addIssue({
          code: "custom",
          path: ["slots", i, rotated ? "rotation" : "x"],
          message: rotated
            ? "slot keluar batas canvas setelah rotasi"
            : "slot melebihi lebar/tinggi canvas",
        });
      }
    });

    // Invariant 2: z unik dan rapat 0..n-1.
    const zCounts = new Map<number, number>();
    for (const slot of layout.slots) {
      zCounts.set(slot.z, (zCounts.get(slot.z) ?? 0) + 1);
    }
    layout.slots.forEach((slot, i) => {
      if ((zCounts.get(slot.z) ?? 0) > 1) {
        ctx.addIssue({ code: "custom", path: ["slots", i, "z"], message: "z slot duplikat" });
      }
    });
    const n = layout.slots.length;
    const missingZ: number[] = [];
    for (let value = 0; value < n; value += 1) {
      if (!zCounts.has(value)) missingZ.push(value);
    }
    if (missingZ.length > 0) {
      const offender = layout.slots.findIndex((slot) => slot.z < 0 || slot.z >= n);
      ctx.addIssue({
        code: "custom",
        path: ["slots", offender === -1 ? 0 : offender, "z"],
        message: "z slot harus 0..n-1 tanpa celah",
      });
    }
  });

export type TemplateLayout = z.infer<typeof layoutSchema>;
export type LayoutSlot = TemplateLayout["slots"][number];

/**
 * AABB (axis-aligned bounding box) slot setelah rotasi. Pivot = pusat slot —
 * sama dengan cara composeFrame merotasi (rotate di sekitar center).
 */
export function slotAabb(slot: LayoutSlot): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const cx = slot.x + slot.width / 2;
  const cy = slot.y + slot.height / 2;
  const rad = (slot.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const halfW = (slot.width / 2) * cos + (slot.height / 2) * sin;
  const halfH = (slot.width / 2) * sin + (slot.height / 2) * cos;
  return { left: cx - halfW, top: cy - halfH, right: cx + halfW, bottom: cy + halfH };
}

/** Layout kosong/null = template legacy (overlay full-canvas, docs/15 §15.2). */
export function slotCount(layout: unknown): number {
  const parsed = layoutSchema.safeParse(layout);
  return parsed.success ? parsed.data.slots.length : 0;
}

/** Slot urut z naik — mapping photos.order_index i → slot ke-i (docs/15 §15.4). */
export function slotsByZ(layout: TemplateLayout): LayoutSlot[] {
  return [...layout.slots].sort((a, b) => a.z - b.z);
}

/** Warna dasar kanvas — `#ffffff` bila template lama tidak menyimpannya. */
export function canvasBackground(layout: TemplateLayout): string {
  return layout.canvas.background ?? DEFAULT_CANVAS_BACKGROUND;
}

/**
 * Math cover/contain-fit: rasio tidak terdistorsi (docs/15 §15.9 AC 2).
 * Return ukuran gambar + offset agar ter-center di area slot.
 */
export function coverFit(
  slotW: number,
  slotH: number,
  imgW: number,
  imgH: number,
  fit: "cover" | "contain" | "fill" = "cover"
): { drawW: number; drawH: number; dx: number; dy: number } {
  if (fit === "fill") return { drawW: slotW, drawH: slotH, dx: 0, dy: 0 };
  const scale =
    fit === "cover" ? Math.max(slotW / imgW, slotH / imgH) : Math.min(slotW / imgW, slotH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  return { drawW, drawH, dx: (slotW - drawW) / 2, dy: (slotH - drawH) / 2 };
}

export type SlotTransform = { zoom?: number; panX?: number; panY?: number };

/**
 * Penempatan foto di dalam slot + clamp transform customer:
 * zoom minimal 1 (cover-fit), pan dibatasi agar foto tetap menutup slot
 * (docs/15 §5.9 editor — "zoom minimal = cover-fit").
 */
export function slotPlacement(
  slot: LayoutSlot,
  imgW: number,
  imgH: number,
  transform: SlotTransform = {}
): {
  x: number;
  y: number;
  drawW: number;
  drawH: number;
  zoom: number;
  panX: number;
  panY: number;
} {
  const base = coverFit(slot.width, slot.height, imgW, imgH, slot.fit ?? "cover");
  const zoom = Math.max(1, transform.zoom ?? 1);
  const drawW = base.drawW * zoom;
  const drawH = base.drawH * zoom;
  const slackX = Math.max(0, (drawW - slot.width) / 2);
  const slackY = Math.max(0, (drawH - slot.height) / 2);
  const panX = Math.min(slackX, Math.max(-slackX, transform.panX ?? 0));
  const panY = Math.min(slackY, Math.max(-slackY, transform.panY ?? 0));
  return {
    x: slot.x + (slot.width - drawW) / 2 + panX,
    y: slot.y + (slot.height - drawH) / 2 + panY,
    drawW,
    drawH,
    zoom,
    panX,
    panY,
  };
}

/** Clamp slot agar tetap di dalam canvas (aturan builder, docs/15 §15.3). */
export function clampSlot(slot: LayoutSlot, canvas: { width: number; height: number }): LayoutSlot {
  const width = Math.min(Math.max(1, slot.width), canvas.width);
  const height = Math.min(Math.max(1, slot.height), canvas.height);
  return {
    ...slot,
    width,
    height,
    x: Math.min(Math.max(0, slot.x), canvas.width - width),
    y: Math.min(Math.max(0, slot.y), canvas.height - height),
  };
}

/** Layout awal builder untuk sebuah preset canvas. */
export function emptyLayout(preset: CanvasPreset): TemplateLayout {
  const dims = preset === "custom" ? { width: 1200, height: 1800 } : CANVAS_PRESETS[preset];
  return {
    version: 1,
    canvas: {
      width: dims.width,
      height: dims.height,
      preset,
      background: DEFAULT_CANVAS_BACKGROUND,
    },
    slots: [],
  };
}
