/**
 * Encoder struk POS untuk printer thermal ESC/POS.
 *
 * Pure (tanpa DOM) supaya layout 32/48 kolom bisa diuji byte-per-byte.
 * Uang selalu integer IDR; format ribuan memakai titik agar terbaca kasir.
 */

import { encodeEscPos, type EscPosBlock } from "./escpos.ts";

export type ReceiptItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type ReceiptData = {
  businessName: string;
  orderNumber: string;
  methodLabel: string;
  boothName?: string | null;
  outletName?: string | null;
  cashierName?: string | null;
  paidAt: string;
  items: readonly ReceiptItem[];
  grossAmount: number;
  discountAmount: number;
  finalAmount: number;
  /** Uang tunai diterima; null/absen = tidak mencetak baris Tunai/Kembali. */
  amountReceived?: number | null;
  /** Kembalian yang dihitung server. */
  changeAmount?: number | null;
};

/** Lebar kolom karakter: 32 untuk 58mm, 48 untuk 80mm (font A). */
export function receiptColumns(paperWidthMm: 58 | 80): number {
  return paperWidthMm === 58 ? 32 : 48;
}

/** Kolom efektif untuk teks berukuran 2x (lebar karakter menjadi separuh). */
export function receiptDoubleColumns(paperWidthMm: 58 | 80): number {
  return Math.floor(receiptColumns(paperWidthMm) / 2);
}

export function formatReceiptMoney(value: number): string {
  const rounded = Math.trunc(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}Rp ${digits}`;
}

/** Potong teks agar tidak melewati kolom; elipsis ASCII untuk printer lama. */
export function fitText(text: string, width: number): string {
  if (width <= 0) return "";
  return text.length <= width ? text : `${text.slice(0, Math.max(0, width - 3))}...`;
}

/** Baris kiri-kanan; bila tidak muat, nilai turun ke baris berikutnya. */
export function receiptLine(left: string, right: string, width: number): string[] {
  const safeRight = fitText(right, width);
  const room = width - safeRight.length - 1;
  if (room < 1) return [fitText(left, width), safeRight.padStart(width)];
  const safeLeft = fitText(left, room);
  return [
    `${safeLeft}${" ".repeat(Math.max(1, width - safeLeft.length - safeRight.length))}${safeRight}`,
  ];
}

export function buildReceiptBlocks(data: ReceiptData, paperWidthMm: 58 | 80): EscPosBlock[] {
  const width = receiptColumns(paperWidthMm);
  const doubleWidth = receiptDoubleColumns(paperWidthMm);
  const divider = "-".repeat(width);
  const blocks: EscPosBlock[] = [
    {
      kind: "text",
      text: fitText(data.businessName.toUpperCase(), doubleWidth),
      align: "center",
      emphasis: true,
      size: 2,
    },
    { kind: "text", text: "STRUK PENJUALAN POS", align: "center" },
    { kind: "text", text: divider },
  ];

  const meta: Array<[string, string | null | undefined]> = [
    ["No", data.orderNumber],
    ["Metode", data.methodLabel],
    ["Booth", data.boothName],
    ["Outlet", data.outletName],
    ["Kasir", data.cashierName],
    ["Waktu", data.paidAt],
  ];
  for (const [label, value] of meta) {
    if (!value) continue;
    for (const line of receiptLine(label, value, width)) blocks.push({ kind: "text", text: line });
  }

  blocks.push({ kind: "text", text: divider });
  for (const item of data.items) {
    blocks.push({ kind: "text", text: fitText(item.name.toUpperCase(), width) });
    const qty = `${item.quantity} x ${formatReceiptMoney(item.unitPrice)}`;
    for (const line of receiptLine(qty, formatReceiptMoney(item.subtotal), width)) {
      blocks.push({ kind: "text", text: line });
    }
  }

  blocks.push({ kind: "text", text: divider });
  for (const line of receiptLine("SUBTOTAL", formatReceiptMoney(data.grossAmount), width)) {
    blocks.push({ kind: "text", text: line });
  }
  for (const line of receiptLine("DISKON", formatReceiptMoney(data.discountAmount), width)) {
    blocks.push({ kind: "text", text: line });
  }
  // Total tetap font 1x: nominal rupiah + label tidak muat bila dicetak 2x
  // pada 58mm (32 kolom menjadi 16), dan printer akan memotong sisi kanan.
  for (const line of receiptLine("TOTAL", formatReceiptMoney(data.finalAmount), width)) {
    blocks.push({ kind: "text", text: line, emphasis: true });
  }
  // Tunai/kembali hanya bila kasir mengisi uang diterima (0083).
  if (typeof data.amountReceived === "number") {
    for (const line of receiptLine("TUNAI", formatReceiptMoney(data.amountReceived), width)) {
      blocks.push({ kind: "text", text: line });
    }
    const change = data.changeAmount ?? data.amountReceived - data.finalAmount;
    for (const line of receiptLine("KEMBALI", formatReceiptMoney(change), width)) {
      blocks.push({ kind: "text", text: line });
    }
  }
  blocks.push({ kind: "text", text: divider });
  blocks.push({ kind: "text", text: "TERIMA KASIH. SNAPYOS POS", align: "center" });
  blocks.push({ kind: "feed", lines: 2 });
  blocks.push({ kind: "cut", partial: true });
  return blocks;
}

export function encodeReceipt(data: ReceiptData, paperWidthMm: 58 | 80): Uint8Array {
  return encodeEscPos(buildReceiptBlocks(data, paperWidthMm));
}

/**
 * Baris teks struk untuk jalur CUPS (PDF teks lewat bridge lokal).
 *
 * Diturunkan dari blok ESC/POS yang sama, jadi lebar kolom konsisten:
 * 58mm = 32 kolom, 80mm = 48 kolom. Judul 2x diganti versi lebar penuh karena
 * PDF tidak punya font 2x.
 */
export function receiptLines(data: ReceiptData, paperWidthMm: 58 | 80): string[] {
  const width = receiptColumns(paperWidthMm);
  const blocks = buildReceiptBlocks(data, paperWidthMm);
  const lines = [
    fitText(data.businessName.toUpperCase(), width),
    ...blocks
      .filter((block): block is Extract<EscPosBlock, { kind: "text" }> => block.kind === "text")
      .filter((block) => block.size === undefined)
      .map((block) => block.text),
  ];
  return lines;
}
