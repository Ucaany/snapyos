/**
 * Konstanta tiket bantuan — docs/04 §4.20 (migration 0050).
 * Murni (tanpa server-only) agar bisa dipakai client component (label status)
 * dan server (data layer) tanpa menarik "server-only" ke bundle client.
 */

export const SUPPORT_TICKET_STATUSES = ["open", "needs_action", "resolved"] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_CATEGORIES = [
  "Pembayaran",
  "Refund",
  "Kiosk / Photobox",
  "Template & Frame",
  "Voucher",
  "Paket & Harga",
  "Dashboard & Laporan",
  "Subscription",
  "Lainnya",
] as const;

export const SUPPORT_TICKET_AREAS = [
  "Checkout / QRIS",
  "Gateway (Midtrans/Tripay)",
  "Refund / Pengembalian dana",
  "Sesi foto / kamera",
  "Cetak / printer",
  "Aktivasi device",
  "POS kasir",
  "Aplikasi web",
  "Lainnya",
] as const;

export const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  open: "Terbuka",
  needs_action: "Butuh tindakan",
  resolved: "Selesai",
};
