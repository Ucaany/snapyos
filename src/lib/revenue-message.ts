/**
 * Format pesan notifikasi revenue SnapyOS (pure — tanpa import server).
 * Dipakai `src/server/revenue-notify.ts` untuk mengirim ke topic Telegram,
 * dan diuji terpisah lewat `revenue-message.test.ts`.
 */

export type RevenueKind =
  | "checkout"
  | "trial"
  | "new_subscription"
  | "renewal"
  | "plan_change"
  | "add_on"
  | "template"
  | "cancelled"
  | "resumed"
  | "expired"
  | "late_payment";

export type RevenueItem = { label: string; qty: number; amount: number };

export type RevenueHistoryLine = { at: string; label: string; amount: number };

export type RevenueHistory = {
  /** Jumlah invoice paid (termasuk transaksi ini). */
  paidCount: number;
  /** Total nominal invoice paid seumur hidup bisnis (termasuk transaksi ini). */
  lifetimeAmount: number;
  lastPaidAt?: string | null;
  joinedAt?: string | null;
  trialEndsAt?: string | null;
  /** Beberapa transaksi paid terakhir (tanpa transaksi ini), terbaru dulu. */
  recent: RevenueHistoryLine[];
  todayAmount?: number;
  monthAmount?: number;
  activeTrials?: number;
};

export type RevenueMessageInput = {
  kind: RevenueKind;
  amount?: number;
  items?: RevenueItem[];
  businessName?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  planName?: string | null;
  invoiceNumber?: string | null;
  provider?: string | null;
  occurredAt?: string | null;
  /** Akhir periode langganan setelah transaksi (ISO). */
  periodEnd?: string | null;
  trialDays?: number | null;
  history?: RevenueHistory | null;
};

const KIND_LABEL: Record<RevenueKind, string> = {
  checkout: "🧾 Transaksi langganan dibuat",
  trial: "🎁 Trial dimulai",
  new_subscription: "✅ Langganan baru",
  renewal: "🔄 Perpanjangan langganan",
  plan_change: "📈 Perubahan paket",
  add_on: "➕ Pembelian add-on",
  template: "🎨 Pembelian template",
  cancelled: "🚫 Langganan dibatalkan",
  resumed: "▶️ Langganan dilanjutkan",
  expired: "⏳ Langganan berakhir",
  late_payment: "⚠️ Pembayaran telat (invoice void)",
};

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function formatRupiah(amount: number): string {
  return `Rp${Math.round(amount).toLocaleString("id-ID")}`;
}

/** 21 Nov 2026, 19.05 WIB */
export function formatWib(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })} WIB`;
}

/** 21 Nov 2026 */
export function formatWibDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function kindHeadline(input: RevenueMessageInput): string {
  const label = KIND_LABEL[input.kind];
  if (input.kind === "trial") return label;
  if (input.amount && input.amount > 0) return `${label} · ${formatRupiah(input.amount)}`;
  return label;
}

function itemLines(items: RevenueItem[] | undefined): string[] {
  if (!items || items.length === 0) return [];
  return items.map((item) => {
    const qty = item.qty > 1 ? ` ×${item.qty}` : "";
    return `   • ${escapeHtml(item.label)}${qty} — ${formatRupiah(item.amount)}`;
  });
}

function historyLines(history: RevenueHistory | null | undefined): string[] {
  if (!history) return [];
  const lines: string[] = ["", "📊 <b>Riwayat bisnis ini</b>"];
  lines.push(
    history.paidCount > 0
      ? `• Total transaksi: <b>${formatRupiah(history.lifetimeAmount)}</b> (${history.paidCount}×)`
      : "• Belum ada transaksi berbayar sebelumnya"
  );
  const joined = formatWibDate(history.joinedAt);
  if (joined) {
    const trialEnd = formatWibDate(history.trialEndsAt);
    lines.push(`• Bergabung: ${joined}${trialEnd ? ` · trial selesai ${trialEnd}` : ""}`);
  }
  if (history.recent.length > 0) {
    lines.push("• Transaksi terakhir:");
    for (const row of history.recent.slice(0, 3)) {
      lines.push(
        `   – ${formatWibDate(row.at) ?? "-"} · ${escapeHtml(row.label)} · ${formatRupiah(row.amount)}`
      );
    }
  } else {
    lines.push("• Transaksi terakhir: —");
  }
  if (history.todayAmount !== undefined || history.monthAmount !== undefined) {
    lines.push(
      `• Revenue hari ini: ${formatRupiah(history.todayAmount ?? 0)} · bulan ini: ${formatRupiah(
        history.monthAmount ?? 0
      )}`
    );
  }
  return lines;
}

/** Pesan HTML untuk satu event revenue. */
export function formatRevenueMessage(input: RevenueMessageInput): string {
  const lines: string[] = [`<b>${escapeHtml(kindHeadline(input))}</b>`];

  if (input.businessName) lines.push(`🏪 Bisnis: <b>${escapeHtml(input.businessName)}</b>`);
  const owner = [input.ownerName, input.ownerEmail].filter(Boolean).join(" · ");
  if (owner) lines.push(`👤 Owner: ${escapeHtml(owner)}`);
  if (input.planName) lines.push(`📦 Paket: ${escapeHtml(input.planName)}`);

  if (input.kind === "trial") {
    const trialEnd = formatWibDate(input.history?.trialEndsAt ?? input.periodEnd ?? null);
    const days = input.trialDays ? ` · ${input.trialDays} hari` : "";
    if (trialEnd) lines.push(`⏳ Trial sampai: ${trialEnd}${days}`);
    if (input.history?.activeTrials !== undefined) {
      lines.push(`🎁 Trial aktif saat ini: ${input.history.activeTrials}`);
    }
  }

  const itemLines_ = itemLines(input.items);
  if (itemLines_.length > 0) {
    lines.push("🧾 Rincian:");
    lines.push(...itemLines_);
  }

  if (input.kind !== "trial" && input.kind !== "cancelled" && input.kind !== "expired") {
    if (input.amount && input.amount > 0) lines.push(`💰 Nominal: <b>${formatRupiah(input.amount)}</b>`);
  }
  if (input.kind === "checkout") lines.push("⏳ Status: menunggu pembayaran");
  if (input.invoiceNumber) lines.push(`🧾 Invoice: <code>${escapeHtml(input.invoiceNumber)}</code>`);
  if (input.provider) lines.push(`💳 Metode: ${escapeHtml(input.provider)}`);
  if (
    (input.kind === "cancelled" || input.kind === "resumed" || input.kind === "renewal") &&
    input.periodEnd
  ) {
    lines.push(`📅 Aktif sampai: ${formatWibDate(input.periodEnd)}`);
  }
  const when = formatWib(input.occurredAt ?? new Date().toISOString());
  if (when) lines.push(`🕒 ${when}`);

  lines.push(...historyLines(input.history));
  return lines.join("\n");
}

export type RevenueDigestInput = {
  /** Rentang laporan, label manusiawi mis. "21 Nov 2026". */
  periodLabel: string;
  revenueToday: number;
  transactionsToday: number;
  revenueMonth: number;
  transactionsMonth: number;
  newTrialsToday: number;
  activeTrials: number;
  byKind: { label: string; count: number; amount: number }[];
  topBusinesses: { name: string; amount: number }[];
};

/** Pesan rekap harian revenue (dikirim sekali sehari ke topic yang sama). */
export function formatRevenueDigest(input: RevenueDigestInput): string {
  const lines = [
    `<b>📈 Rekap Revenue SnapyOS — ${escapeHtml(input.periodLabel)}</b>`,
    "",
    `💰 Hari ini: <b>${formatRupiah(input.revenueToday)}</b> (${input.transactionsToday} transaksi)`,
    `📅 Bulan ini: ${formatRupiah(input.revenueMonth)} (${input.transactionsMonth} transaksi)`,
    `🎁 Trial baru hari ini: ${input.newTrialsToday} · trial aktif: ${input.activeTrials}`,
  ];
  if (input.byKind.length > 0) {
    lines.push("", "🧾 Rincian hari ini:");
    for (const row of input.byKind) {
      lines.push(`   • ${escapeHtml(row.label)}: ${formatRupiah(row.amount)} (${row.count}×)`);
    }
  }
  if (input.topBusinesses.length > 0) {
    lines.push("", "🏆 Pembayar teratas hari ini:");
    for (const row of input.topBusinesses.slice(0, 5)) {
      lines.push(`   • ${escapeHtml(row.name)} — ${formatRupiah(row.amount)}`);
    }
  }
  return lines.join("\n");
}

export const REVENUE_KIND_LABEL = KIND_LABEL;
