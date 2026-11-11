/**
 * Peringatan operasional dashboard owner — pure, tanpa supabase.
 * Ambang: src/lib/booth-health.ts (booth stale, storage, langganan).
 */

import {
  BOOTH_STALE_MINUTES,
  STORAGE_ALERT_PERCENT,
  SUBSCRIPTION_ALERT_DAYS,
} from "./booth-health.ts";

export type DashboardAlertTone = "danger" | "warning" | "info";

export type DashboardAlert = {
  key:
    | "booth_offline"
    | "payment_failed"
    | "storage_high"
    | "subscription_expiring"
    | "booth_no_template";
  tone: DashboardAlertTone;
  title: string;
  detail: string;
  href: string;
  /** Jumlah yang memicu alert (dipakai badge angka). */
  count: number;
};

export type DashboardAlertInput = {
  /** Booth non-maintenance dengan heartbeat ≥ BOOTH_STALE_MINUTES. */
  staleBooths: { name: string; offlineMinutes: number | null }[];
  /** Payment berstatus failed dalam 24 jam terakhir. */
  failedPayments: number;
  storage: { percent: number; usedMb: number; limitMb: number } | null;
  /** Sisa hari langganan efektif; null = tidak ada langganan/tanggal. */
  subscriptionDaysLeft: number | null;
  /** Booth aktif tanpa default_template_id. */
  boothsWithoutDefaultTemplate: number;
};

const TONE_ORDER: Record<DashboardAlertTone, number> = { danger: 0, warning: 1, info: 2 };

export function buildDashboardAlerts(input: DashboardAlertInput): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  if (input.staleBooths.length > 0) {
    const names = input.staleBooths
      .slice(0, 3)
      .map((b) => (b.offlineMinutes === null ? b.name : `${b.name} (${b.offlineMinutes} mnt)`))
      .join(", ");
    const extra = input.staleBooths.length > 3 ? ` +${input.staleBooths.length - 3} lain` : "";
    alerts.push({
      key: "booth_offline",
      tone: "danger",
      title: "Booth offline",
      detail: `${input.staleBooths.length} booth tanpa heartbeat ≥ ${BOOTH_STALE_MINUTES} menit: ${names}${extra}.`,
      href: "/dashboard/photoboxes",
      count: input.staleBooths.length,
    });
  }

  if (input.failedPayments > 0) {
    alerts.push({
      key: "payment_failed",
      tone: "danger",
      title: "Payment gagal 24 jam",
      detail: `${input.failedPayments} payment berstatus gagal dalam 24 jam terakhir. Periksa kredensial gateway dan status transaksi.`,
      href: "/dashboard/transactions",
      count: input.failedPayments,
    });
  }

  if (input.storage && input.storage.percent >= STORAGE_ALERT_PERCENT) {
    alerts.push({
      key: "storage_high",
      tone: "warning",
      title: "Storage hampir penuh",
      detail: `Terpakai ${input.storage.percent}% (${input.storage.usedMb} MB dari ${input.storage.limitMb} MB). Hapus media lama atau tambah kuota.`,
      href: "/dashboard/settings",
      count: input.storage.percent,
    });
  }

  if (
    input.subscriptionDaysLeft !== null &&
    input.subscriptionDaysLeft <= SUBSCRIPTION_ALERT_DAYS
  ) {
    const expired = input.subscriptionDaysLeft <= 0;
    alerts.push({
      key: "subscription_expiring",
      tone: expired ? "danger" : "warning",
      title: expired ? "Langganan kedaluwarsa" : "Langganan hampir berakhir",
      detail: expired
        ? "Masa aktif langganan sudah habis. Perpanjang agar dashboard dan kiosk tetap berjalan."
        : `Sisa ${input.subscriptionDaysLeft} hari. Perpanjang sebelum kiosk berhenti melayani.`,
      href: "/dashboard/subscription",
      count: Math.max(0, input.subscriptionDaysLeft),
    });
  }

  if (input.boothsWithoutDefaultTemplate > 0) {
    alerts.push({
      key: "booth_no_template",
      tone: "info",
      title: "Booth tanpa template default",
      detail: `${input.boothsWithoutDefaultTemplate} booth belum punya template default; frame mengikuti template paket. Set default per booth agar hasil konsisten.`,
      href: "/dashboard/photoboxes",
      count: input.boothsWithoutDefaultTemplate,
    });
  }

  return alerts.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
}
