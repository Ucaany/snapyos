/**
 * Geometri halaman dan PDF lembar cetak. Dipindah dari
 * `scripts/photobooth-bridge.mjs:139–244`; kini mengikuti template:
 * preset kertas (4x6/2x6/5x7/6x8/A6), orientasi auto, fit contain/cover,
 * strip vertikal proporsional, dan strip 2-up pada kertas 4x6.
 */

import PDFDocument from "pdfkit";

export type PrintInput = {
  paper_size?: unknown;
  orientation?: unknown;
  margins_mm?: unknown;
  printer_name?: unknown;
  /** Override nama media CUPS; kosong = `Custom.WxHmm`. */
  media_name?: unknown;
  /** auto|contain|cover (auto diturunkan dari jenis lembar). */
  fit?: unknown;
  /** Dua salinan strip per kertas 4x6 landscape. */
  strip_2up?: unknown;
  /** true = lembar berframe/composite (auto → contain, jangan crop bingkai). */
  framed?: unknown;
  /** Rasio kanvas (lebar/tinggi) untuk orientation=auto. */
  canvas_aspect?: unknown;
  /** Lebar kertas struk thermal 58/80mm (jalur teks `/printer/test`). */
  paper_width_mm?: unknown;
  /** Idempotensi antrean cetak (default: session_id + hash lembar). */
  dedupe_key?: unknown;
  session_id?: unknown;
  sheets?: unknown;
  title?: unknown;
  lines?: unknown;
};

export type Geometry = { widthMm: number; heightMm: number; marginMm: number };
export type PrintFit = "contain" | "cover";
export type Placement = { x: number; y: number; width: number; height: number };

export const PAPER_MM: Record<string, { w: number; h: number }> = {
  "4x6": { w: 101.6, h: 152.4 },
  "2x6": { w: 50.8, h: 152.4 },
  "5x7": { w: 127, h: 177.8 },
  "6x8": { w: 152.4, h: 203.2 },
  A6: { w: 105, h: 148 },
};

export function mmToPt(value: number): number {
  return value * (72 / 25.4);
}

function normalizePaper(value: unknown): string {
  return typeof value === "string" && value in PAPER_MM ? value : "4x6";
}

export function printGeometry(input: PrintInput = {}): Geometry {
  const paperSize = normalizePaper(input.paper_size);
  const base = PAPER_MM[paperSize]!;
  let landscape = input.orientation === "landscape";
  if (input.orientation === "auto") {
    const aspect = Number(input.canvas_aspect);
    landscape = Number.isFinite(aspect) && aspect > 1;
  }
  // Dua strip 2x6 masuk satu kertas 4x6 landscape (2 × 50.8 = 101.6 mm).
  if (input.strip_2up === true && paperSize === "4x6") landscape = true;
  const rawMargin = Number(input.margins_mm);
  const margin = Math.min(20, Math.max(0, Number.isFinite(rawMargin) ? rawMargin : 0));
  return {
    widthMm: landscape ? base.h : base.w,
    heightMm: landscape ? base.w : base.h,
    marginMm: margin,
  };
}

/**
 * Geometri struk teks: 58/80mm selebar gulungan, tinggi mengikuti jumlah baris
 * supaya PDF tidak menyisakan kertas kosong panjang. `null` = bukan struk.
 */
export function receiptGeometry(input: PrintInput): Geometry | null {
  const width = Number(input.paper_width_mm);
  if (width !== 58 && width !== 80) return null;
  const rows = Array.isArray(input.lines) ? input.lines.length : 0;
  return { widthMm: width, heightMm: Math.max(60, 20 + rows * 5), marginMm: 2 };
}

export function printerNameOf(input: PrintInput): string {
  return typeof input.printer_name === "string" ? input.printer_name.trim().slice(0, 128) : "";
}

/** Nama media CUPS: override owner, fallback `Custom.WxHmm`. */
export function mediaNameOf(input: PrintInput, geometry: Geometry): string {
  const override = typeof input.media_name === "string" ? input.media_name.trim() : "";
  return override.slice(0, 120) || `Custom.${geometry.widthMm}x${geometry.heightMm}mm`;
}

export function decodeImage(value: unknown): Buffer {
  if (typeof value !== "string" || value.length === 0 || value.length > 16 * 1024 * 1024) {
    throw new Error("Data foto tidak valid.");
  }
  const body = Buffer.from(value, "base64");
  if (body.length < 4) throw new Error("Foto kosong.");
  return body;
}

/** Fit efektif: eksplisit menang; auto → contain (frame/strip) atau cover (foto tunggal). */
export function resolveFit(
  requested: unknown,
  sheet: { framed: boolean; strip: boolean }
): PrintFit {
  if (requested === "contain" || requested === "cover") return requested;
  if (sheet.framed || sheet.strip) return "contain";
  return "cover";
}

/**
 * Tempatkan gambar di dalam kotak. `contain` = muat utuh (letterbox),
 * `cover` = isi penuh lalu crop terpusat (pemanggil wajib clip).
 */
export function placePrintImage(input: {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  imageWidth: number;
  imageHeight: number;
  fit: PrintFit;
}): Placement {
  const { boxX, boxY, boxWidth, boxHeight, fit } = input;
  const imageWidth = Math.max(1, input.imageWidth);
  const imageHeight = Math.max(1, input.imageHeight);
  const sx = boxWidth / imageWidth;
  const sy = boxHeight / imageHeight;
  const scale = fit === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: boxX + (boxWidth - width) / 2,
    y: boxY + (boxHeight - height) / 2,
    width,
    height,
  };
}

export type OpenedImage = { width: number; height: number };

/** `openImage` ada di runtime pdfkit tetapi tidak di typings publiknya. */
function openImage(doc: PDFKit.PDFDocument, buffer: Buffer): OpenedImage {
  return (doc as unknown as { openImage(value: Buffer): OpenedImage }).openImage(buffer);
}

function drawInBox(
  doc: PDFKit.PDFDocument,
  image: Buffer,
  box: { x: number; y: number; width: number; height: number },
  fit: PrintFit,
  clip: boolean
): void {
  const opened = openImage(doc, image);
  const place = placePrintImage({
    boxX: box.x,
    boxY: box.y,
    boxWidth: box.width,
    boxHeight: box.height,
    imageWidth: opened.width,
    imageHeight: opened.height,
    fit,
  });
  doc.save();
  if (clip) doc.rect(box.x, box.y, box.width, box.height).clip();
  doc.image(image, place.x, place.y, { width: place.width, height: place.height });
  doc.restore();
}

export function buildPdf(input: PrintInput, test = false): Promise<Buffer> {
  // Struk teks membawa lebar gulungan sendiri; jangan pakai preset foto.
  const geometry = (test ? receiptGeometry(input) : null) ?? printGeometry(input);
  const width = mmToPt(geometry.widthMm);
  const height = mmToPt(geometry.heightMm);
  const margin = mmToPt(geometry.marginMm);
  const contentWidth = Math.max(1, width - margin * 2);
  const contentHeight = Math.max(1, height - margin * 2);
  const doc = new PDFDocument({ autoFirstPage: false, margin: 0, compress: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.once("end", () => resolve(Buffer.concat(chunks)));
    doc.once("error", reject);
  });

  if (test) {
    doc.addPage({ size: [width, height], margin: 0 });
    const receipt = receiptGeometry(input) !== null;
    if (receipt) {
      // Struk teks: tiap baris sudah dipotong ke 32/48 kolom oleh pemanggil.
      // Tanpa garis bingkai — printer thermal akan mencetaknya sebagai isi.
      const lines = Array.isArray(input.lines) ? input.lines.slice(0, 60) : [];
      doc
        .font("Courier")
        .fontSize(width <= 58 ? 7 : 9)
        .text(lines.map(String).join("\n"), margin, margin, {
          width: contentWidth,
          align: "left",
          lineGap: 0,
        });
    } else {
      doc.save().lineWidth(2).rect(margin, margin, contentWidth, contentHeight).stroke().restore();
      doc
        .font("Helvetica-Bold")
        .fontSize(16)
        .text(String(input.title || "SNAPYOS TEST"), margin, margin + 18, {
          width: contentWidth,
          align: "center",
        });
      const lines = Array.isArray(input.lines) ? input.lines.slice(0, 5) : [];
      doc
        .font("Helvetica")
        .fontSize(9)
        .text(lines.map(String).join("\n"), margin + 8, margin + 48, {
          width: contentWidth - 16,
          align: "center",
        });
      doc
        .save()
        .rect(margin + 8, height - margin - 14, contentWidth - 16, 6)
        .fill("#111111")
        .restore();
    }
  } else {
    if (!Array.isArray(input.sheets) || input.sheets.length < 1 || input.sheets.length > 50) {
      throw new Error("Lembar cetak tidak valid.");
    }
    const framed = input.framed === true;
    const strip2up = input.strip_2up === true && normalizePaper(input.paper_size) === "4x6";
    for (const sheet of input.sheets) {
      if (!Array.isArray(sheet) || sheet.length < 1 || sheet.length > 8) {
        throw new Error("Isi lembar cetak tidak valid.");
      }
      const images = sheet.map(decodeImage);
      const strip = images.length > 1;
      const fit = resolveFit(input.fit, { framed, strip });
      doc.addPage({ size: [width, height], margin: 0 });

      if (strip && strip2up) {
        // Dua salinan strip, masing-masing dirotasi 90° → dua baris horizontal.
        drawStrip2Up(doc, images, {
          x: margin,
          y: margin,
          width: contentWidth,
          height: contentHeight,
        });
        continue;
      }

      if (!strip) {
        drawInBox(
          doc,
          images[0]!,
          { x: margin, y: margin, width: contentWidth, height: contentHeight },
          fit,
          fit === "cover"
        );
        continue;
      }

      // Strip: susun vertikal proporsional (bukan tinggi sama paksa).
      drawStripVertical(doc, images, {
        x: margin,
        y: margin,
        width: contentWidth,
        height: contentHeight,
        fit,
      });
    }
  }
  doc.end();
  return result;
}

function drawStripVertical(
  doc: PDFKit.PDFDocument,
  images: Buffer[],
  box: { x: number; y: number; width: number; height: number; fit: PrintFit }
): void {
  const opened = images.map((buffer) => openImage(doc, buffer));
  const naturalHeights = opened.map((img) => box.width * (img.height / Math.max(1, img.width)));
  const totalNatural = naturalHeights.reduce((sum, value) => sum + value, 0);
  const scale = totalNatural > box.height ? box.height / totalNatural : 1;
  const rowWidth = box.width * scale;
  const totalHeight = totalNatural * scale;
  let cursor = box.y + (box.height - totalHeight) / 2;
  const x = box.x + (box.width - rowWidth) / 2;
  images.forEach((buffer, index) => {
    const img = opened[index]!;
    const rowHeight = box.width * scale * (img.height / Math.max(1, img.width));
    if (box.fit === "cover") {
      drawInBox(doc, buffer, { x, y: cursor, width: rowWidth, height: rowHeight }, "cover", true);
    } else {
      doc.image(buffer, x, cursor, { width: rowWidth, height: rowHeight });
    }
    cursor += rowHeight;
  });
}

function drawStrip2Up(
  doc: PDFKit.PDFDocument,
  images: Buffer[],
  box: { x: number; y: number; width: number; height: number }
): void {
  const columns = images.length;
  const cellWidth = box.width / columns;
  const cellHeight = box.height / 2;
  // Dua salinan strip identik; setiap salinan = N foto berdampingan.
  for (let row = 0; row < 2; row++) {
    images.forEach((buffer, column) => {
      drawInBox(
        doc,
        buffer,
        {
          x: box.x + column * cellWidth,
          y: box.y + row * cellHeight,
          width: cellWidth,
          height: cellHeight,
        },
        "contain",
        false
      );
    });
  }
}
