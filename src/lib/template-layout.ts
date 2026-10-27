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

export const SLOT_SHAPES = ["rect", "rounded", "circle", "ellipse"] as const;
export const SLOT_FITS = ["cover", "contain"] as const;

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
});

/**
 * Layout jsonb contract (trust boundary — docs/15 §15.2):
 * slot harus berada sepenuhnya di dalam canvas, ukuran > 0, max 8 slot.
 */
export const layoutSchema = z
  .object({
    version: z.literal(1),
    canvas: z.object({
      width: z.number().int().min(1).max(CANVAS_MAX),
      height: z.number().int().min(1).max(CANVAS_MAX),
      preset: z.string().trim().min(1).max(32),
    }),
    slots: z.array(slotSchema).max(MAX_SLOTS),
  })
  .superRefine((layout, ctx) => {
    const { width: W, height: H } = layout.canvas;
    layout.slots.forEach((slot, i) => {
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
      if (slot.x + slot.width > W) {
        ctx.addIssue({
          code: "custom",
          path: ["slots", i, "x"],
          message: "slot melebihi lebar canvas",
        });
      }
      if (slot.y + slot.height > H) {
        ctx.addIssue({
          code: "custom",
          path: ["slots", i, "y"],
          message: "slot melebihi tinggi canvas",
        });
      }
    });
  });

export type TemplateLayout = z.infer<typeof layoutSchema>;
export type LayoutSlot = TemplateLayout["slots"][number];

/** Layout kosong/null = template legacy (overlay full-canvas, docs/15 §15.2). */
export function slotCount(layout: unknown): number {
  const parsed = layoutSchema.safeParse(layout);
  return parsed.success ? parsed.data.slots.length : 0;
}

/** Slot urut z naik — mapping photos.order_index i → slot ke-i (docs/15 §15.4). */
export function slotsByZ(layout: TemplateLayout): LayoutSlot[] {
  return [...layout.slots].sort((a, b) => a.z - b.z);
}

/**
 * Slot efektif untuk render/print.
 *
 * Layout tanpa slot (template legacy) TIDAK berarti "tanpa foto": foto customer
 * digambar penuh satu kanvas DI BELAKANG frame, lalu frame PNG ditimpa di atasnya.
 * Dengan begitu template tidak terpotong, area transparan frame terisi foto, dan
 * owner tidak wajib menggambar slot manual lebih dulu.
 */
export function effectiveSlots(layout: TemplateLayout): LayoutSlot[] {
  if (layout.slots.length > 0) return slotsByZ(layout);
  return [
    {
      id: "auto-full",
      shape: "rect",
      x: 0,
      y: 0,
      width: layout.canvas.width,
      height: layout.canvas.height,
      rotation: 0,
      z: 0,
      fit: "cover",
    },
  ];
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
  fit: "cover" | "contain" = "cover"
): { drawW: number; drawH: number; dx: number; dy: number } {
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
    canvas: { width: dims.width, height: dims.height, preset },
    slots: [],
  };
}
