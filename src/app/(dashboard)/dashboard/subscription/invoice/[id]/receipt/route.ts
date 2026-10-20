import { NextResponse } from "next/server";
import { redirect } from "next/navigation";

import PDFDocument from "pdfkit";

import { requireUser } from "@/lib/tenant";
import { formatIDR } from "@/lib/dashboard-math";
import { getInvoiceReceipt } from "@/server/payment/invoice";

/**
 * GET /dashboard/subscription/invoice/[id]/receipt — bukti pembayaran invoice.
 * Menghasilkan file PDF mandiri (vector, siap cetak/arsip), bukan HTML.
 */

const BLACK = "#111111";
const GRAY = "#6b6b6b";
const YELLOW = "#ffd43b";

const PAGE_W = 595.28; // A4
const M = 40; // margin luar sheet
const CONTENT_W = PAGE_W - M * 2;
const LABEL_W = 170;

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function providerLabel(provider: string | null): string {
  if (!provider) return "QRIS";
  const name = { pakasir: "Pakasir", midtrans: "Midtrans", tripay: "Tripay" }[provider];
  return name ? `QRIS (${name})` : "QRIS";
}

type Receipt = NonNullable<Awaited<ReturnType<typeof getInvoiceReceipt>>>;

async function renderPdf(receipt: Receipt): Promise<Buffer> {
  const { invoice } = receipt;
  const items = invoice.items.map((it) => ({
    name: it.name || it.type,
    qty: it.qty,
    amount: it.amount * it.qty,
  }));
  const gross = items.reduce((sum, i) => sum + i.amount, 0);
  const discount = invoice.promo?.discount ?? 0;

  const doc = new PDFDocument({
    size: "A4",
    margin: 0,
    info: { Title: `Bukti Pembayaran ${invoice.number}: SnapyOS` },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  );

  // Sheet (border hitam tebal, radius 0).
  doc.lineWidth(3).strokeColor(BLACK).rect(M, M, CONTENT_W, 760).stroke();

  // Header.
  let y = M + 28;
  doc
    .font("Helvetica-Bold")
    .fontSize(30)
    .fillColor(BLACK)
    .text("SnapyOS", M + 20, y, { lineBreak: false });
  doc
    .font("Courier")
    .fontSize(9)
    .fillColor(GRAY)
    .text("PHOTOBOX SAAS PLATFORM", M + 20, y + 30, { lineBreak: false });
  doc
    .font("Courier")
    .fontSize(9)
    .fillColor(GRAY)
    .text("BUKTI PEMBAYARAN", M + 20, y + 12, { width: CONTENT_W - 40, align: "right" });
  y += 56;
  doc
    .lineWidth(3)
    .strokeColor(BLACK)
    .moveTo(M, y)
    .lineTo(PAGE_W - M, y)
    .stroke();

  // Banner lunas.
  const bannerY = y + 20;
  doc.fillColor(YELLOW).rect(M, bannerY, CONTENT_W, 40).fill();
  doc.lineWidth(3).strokeColor(BLACK).rect(M, bannerY, CONTENT_W, 40).stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(BLACK)
    .text("LUNAS: PEMBAYARAN DITERIMA", M, bannerY + 14, {
      width: CONTENT_W,
      align: "center",
    });
  y = bannerY + 62;

  // Baris detail.
  const row = (label: string, value: string) => {
    doc
      .font("Courier")
      .fontSize(9)
      .fillColor(GRAY)
      .text(label.toUpperCase(), M + 20, y, { lineBreak: false });
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(BLACK)
      .text(value, M + 20 + LABEL_W, y, { width: CONTENT_W - 40 - LABEL_W });
    y = Math.max(y + 15, doc.y + 6);
  };

  row("Nomor Invoice", invoice.number);
  row("Business", invoice.businessName);
  row("Tanggal Dibuat", fmtDate(invoice.createdAt));
  row("Dibayar", `${fmtDate(invoice.paidAt)} WIB`);
  row("Metode", providerLabel(receipt.provider));
  if (receipt.orderId) row("Order ID", receipt.orderId);
  if (receipt.paymentReference) row("Referensi", receipt.paymentReference);

  // Tabel item.
  const amtX = PAGE_W - M - 160;
  const qtyX = amtX - 70;
  const itemW = qtyX - (M + 20) - 8;

  y += 14;
  doc
    .lineWidth(2)
    .strokeColor(BLACK)
    .moveTo(M, y)
    .lineTo(PAGE_W - M, y)
    .stroke();
  y += 6;
  doc
    .font("Courier")
    .fontSize(8)
    .fillColor(GRAY)
    .text("ITEM", M + 20, y, { lineBreak: false });
  doc.text("QTY", qtyX, y, { width: 70, align: "right" });
  doc.text("JUMLAH", amtX, y, { width: 160, align: "right" });
  y += 16;

  for (const it of items) {
    doc
      .font("Courier")
      .fontSize(10)
      .fillColor(BLACK)
      .text(it.name, M + 20, y, { width: itemW });
    doc.text(String(it.qty), qtyX, y, { width: 70, align: "right" });
    doc.text(formatIDR(it.amount), amtX, y, { width: 160, align: "right" });
    y = Math.max(y + 16, doc.y + 8);
  }

  y += 4;
  doc
    .lineWidth(1)
    .strokeColor("#e5e5e5")
    .moveTo(M + 20, y)
    .lineTo(PAGE_W - M, y)
    .stroke();
  y += 12;

  const moneyRow = (label: string, value: string, bold: boolean) => {
    doc
      .font(bold ? "Helvetica-Bold" : "Courier")
      .fontSize(bold ? 12 : 10)
      .fillColor(BLACK)
      .text(label, M + 20, y, { lineBreak: false });
    doc
      .font(bold ? "Helvetica-Bold" : "Courier")
      .fontSize(bold ? 12 : 10)
      .text(value, amtX, y, { width: 160, align: "right" });
    y += bold ? 24 : 18;
  };

  moneyRow("Subtotal", formatIDR(gross), false);
  if (discount > 0) {
    moneyRow(
      `Diskon${invoice.promo?.code ? ` (${invoice.promo.code.toUpperCase()})` : ""}`,
      `-${formatIDR(discount)}`,
      false
    );
  }
  doc
    .lineWidth(3)
    .strokeColor(BLACK)
    .moveTo(M + 20, y - 6)
    .lineTo(PAGE_W - M, y - 6)
    .stroke();
  moneyRow("Jumlah Dibayar", formatIDR(invoice.amount), true);

  // Footer.
  const footY = M + 760 - 60;
  doc
    .lineWidth(3)
    .strokeColor(BLACK)
    .moveTo(M, footY)
    .lineTo(PAGE_W - M, footY)
    .stroke();
  doc
    .font("Courier")
    .fontSize(8)
    .fillColor(GRAY)
    .text(
      [
        "Bukti pembayaran diterbitkan otomatis oleh sistem SnapyOS.",
        "Plan / add-on pada invoice ini aktif otomatis untuk business di atas.",
        "Simpan file ini sebagai arsip pembayaran.",
      ].join("\n"),
      M + 20,
      footY + 14,
      { width: CONTENT_W - 40, lineGap: 3 }
    );

  doc.end();
  return done;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const receipt = await getInvoiceReceipt(user.id, id);
  if (!receipt) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const pdf = await renderPdf(receipt);
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "no-store",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${receipt.invoice.number}.pdf"`,
    },
  });
}
