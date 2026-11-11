/**
 * Layer teks slot (template) — digambar DI ATAS frame oleh composeFrame.
 * Dipisah ke modul sendiri agar bisa diuji tanpa DOM/native canvas.
 *
 * Layout lama tanpa `properties.text` tidak menggambar apa pun, sehingga JPEG
 * hasilnya identik byte dengan sebelum fitur teks ada.
 */

import { defaultBrandColors } from "./brand-defaults.ts";
import type { EditorProperties, LayoutSlot } from "./template-layout.ts";

const SLOT_FONTS: Record<string, string> = {
  display: '"Archivo Black", "IBM Plex Sans", sans-serif',
  sans: '"IBM Plex Sans", system-ui, sans-serif',
  mono: '"IBM Plex Mono", "Courier New", monospace',
};

/** Context minimal yang dipakai — cukup untuk ctx canvas asli maupun palsu. */
export type TextContext = Pick<
  CanvasRenderingContext2D,
  | "save"
  | "restore"
  | "beginPath"
  | "rect"
  | "clip"
  | "translate"
  | "rotate"
  | "fillText"
  | "measureText"
> & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  letterSpacing?: string;
};

/** Bungkus teks ke lebar slot; baris berlebih dibuang (render deterministik). */
export function wrapText(
  ctx: TextContext,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = words[0]!;
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${line} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = words[i]!;
      }
    }
    lines.push(line);
    if (lines.length >= maxLines) break;
  }
  return lines.slice(0, Math.max(1, maxLines));
}

/** Teks slot bila ada, null bila slot tidak punya teks. */
export function slotTextProps(slot: LayoutSlot): (EditorProperties & { text: string }) | null {
  const props = slot.properties;
  const text = props?.text?.trim();
  if (!props || !text) return null;
  return { ...props, text };
}

/**
 * Gambar teks satu slot pada skala tertentu (koordinat kanvas → kanvas output).
 * Rotasi memakai pivot center slot, sama seperti foto.
 */
export function drawSlotText(ctx: TextContext, slot: LayoutSlot, scale: number): boolean {
  const props = slotTextProps(slot);
  if (!props) return false;

  const fontSize = (props.fontSize ?? 32) * scale;
  if (fontSize <= 0) return false;
  const fontFamily = SLOT_FONTS[props.fontFamily ?? "display"] ?? SLOT_FONTS.display!;
  const weight = props.fontWeight ?? 700;
  const lineHeight = props.lineHeight ?? 1.2;
  const alignment = props.alignment ?? "center";
  const slotW = slot.width * scale;
  const slotH = slot.height * scale;

  ctx.save();
  const cx = (slot.x + slot.width / 2) * scale;
  const cy = (slot.y + slot.height / 2) * scale;
  ctx.translate(cx, cy);
  ctx.rotate((slot.rotation * Math.PI) / 180);
  ctx.translate(-cx, -cy);

  // Teks tetap di dalam slot: tanpa clip, teks panjang bocor ke seluruh kanvas.
  ctx.beginPath();
  ctx.rect(slot.x * scale, slot.y * scale, slotW, slotH);
  ctx.clip();

  ctx.globalAlpha = Math.min(1, Math.max(0, props.opacity ?? 1));
  ctx.fillStyle = props.color ?? defaultBrandColors.ink;
  ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
  if ("letterSpacing" in ctx) {
    ctx.letterSpacing = `${(props.letterSpacing ?? 0) * fontSize}px`;
  }
  ctx.textAlign = alignment;
  ctx.textBaseline = "top";

  const maxLines = Math.max(1, Math.floor(slotH / (fontSize * lineHeight)));
  const lines = wrapText(ctx, props.text, slotW, maxLines);
  const x =
    alignment === "left"
      ? slot.x * scale
      : alignment === "right"
        ? (slot.x + slot.width) * scale
        : (slot.x + slot.width / 2) * scale;
  lines.forEach((line, index) => {
    ctx.fillText(line, x, slot.y * scale + index * fontSize * lineHeight);
  });
  ctx.restore();
  return true;
}
