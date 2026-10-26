/**
 * Geometri halaman dan PDF lembar cetak. Dipindah dari
 * `scripts/photobooth-bridge.mjs:139–244` tanpa perubahan hasil: ukuran kertas,
 * margin, dan urutan gambar harus identik dengan yang sudah diuji.
 */

import PDFDocument from "pdfkit";

export type PrintInput = {
  paper_size?: unknown;
  orientation?: unknown;
  margins_mm?: unknown;
  printer_name?: unknown;
  sheets?: unknown;
  title?: unknown;
  lines?: unknown;
};

export type Geometry = { widthMm: number; heightMm: number; marginMm: number };

export function mmToPt(value: number): number {
  return value * (72 / 25.4);
}

export function printGeometry(input: PrintInput = {}): Geometry {
  const paperSize = input.paper_size === "A6" ? "A6" : "4x6";
  const base = paperSize === "A6" ? { width: 105, height: 148 } : { width: 101.6, height: 152.4 };
  const landscape = input.orientation === "landscape";
  const rawMargin = Number(input.margins_mm);
  const margin = Math.min(20, Math.max(0, Number.isFinite(rawMargin) ? rawMargin : 0));
  return {
    widthMm: landscape ? base.height : base.width,
    heightMm: landscape ? base.width : base.height,
    marginMm: margin,
  };
}

export function printerNameOf(input: PrintInput): string {
  return typeof input.printer_name === "string" ? input.printer_name.trim().slice(0, 128) : "";
}

export function decodeImage(value: unknown): Buffer {
  if (typeof value !== "string" || value.length === 0 || value.length > 16 * 1024 * 1024) {
    throw new Error("Data foto tidak valid.");
  }
  const body = Buffer.from(value, "base64");
  if (body.length < 4) throw new Error("Foto kosong.");
  return body;
}

export function buildPdf(input: PrintInput, test = false): Promise<Buffer> {
  const geometry = printGeometry(input);
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
  } else {
    if (!Array.isArray(input.sheets) || input.sheets.length < 1 || input.sheets.length > 50) {
      throw new Error("Lembar cetak tidak valid.");
    }
    for (const sheet of input.sheets) {
      if (!Array.isArray(sheet) || sheet.length < 1 || sheet.length > 8) {
        throw new Error("Isi lembar cetak tidak valid.");
      }
      doc.addPage({ size: [width, height], margin: 0 });
      const rowHeight = contentHeight / sheet.length;
      sheet.forEach((encoded, index) => {
        doc.image(decodeImage(encoded), margin, margin + rowHeight * index, {
          fit: [contentWidth, rowHeight],
          align: "center",
          valign: "center",
        });
      });
    }
  }
  doc.end();
  return result;
}
