/**
 * Pure helpers dashboard — uang SELALU integer IDR (docs/03 §3.1, no float).
 * Dipisah dari server module agar bisa di-unit-test tanpa Supabase.
 * ponytail: agregasi via TS atas baris slim; upgrade ke SQL agregat/rpc di Phase 8.
 */

import { z } from "zod";

export const MAX_RANGE_DAYS = 366;

/** YYYY-MM-DD strict (zod v4: z.iso.date? — pakai regex + refine calendar). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v + "T00:00:00Z")), "Tanggal tidak valid");

/** Format tanggal saja (tanpa cek urutan) — untuk jalur render yang menormalkan rentang. */
export const dateFieldsSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export type DateRangeFields = z.infer<typeof dateFieldsSchema>;

/**
 * Safe-parse untuk jalur render (URL bisa diketik/di-bookmark): tanggal yang
 * formatnya salah DIBUANG (jadi undefined → jatuh ke default), bukan melempar
 * error. ZodError dari `.parse()` di RSC akan menjatuhkan halaman via error
 * boundary — perilaku yang tidak diinginkan untuk input URL bebas.
 */
export function coerceDateFields(query: {
  from?: unknown;
  to?: unknown;
}): DateRangeFields {
  const out: DateRangeFields = {};
  const from = isoDate.safeParse(query.from);
  if (from.success) out.from = from.data;
  const to = isoDate.safeParse(query.to);
  if (to.success) out.to = to.data;
  return out;
}

export const dateRangeSchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    { message: "'from' harus ≤ 'to'" }
  );

export type DateRangeInput = z.infer<typeof dateRangeSchema>;

/** Rentang default: 30 hari terakhir sampai hari ini (inklusif). */
export function defaultRange(today = todayISO("UTC")): Required<DateRangeInput> {
  const to = today;
  const from = shiftISO(to, -29);
  return { from, to };
}

export function todayISO(timeZone = "UTC", now: Date | number = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now instanceof Date ? now : new Date(now));
}

/** Geser tanggal YYYY-MM-DD sebanyak n hari. */
export function shiftISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Durasi inklusif (hari) antar dua tanggal. */
export function rangeDays(from: string, to: string): number {
  const ms = Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z");
  return Math.floor(ms / 86_400_000) + 1;
}

/**
 * Batas rentang sebagai UTC ms: `from` 00:00 lokal tz → `to` 24:00 lokal tz.
 * Offset tz dihitung dari tanggal itu sendiri (aman DST).
 */
export function rangeBoundariesTz(
  from: string,
  to: string,
  timeZone: string
): { startMs: number; endMs: number } {
  const toNext = shiftISO(to, 1);
  return {
    startMs: startOfDayTz(from, timeZone),
    endMs: Date.parse(toNext + "T00:00:00Z") - tzOffsetMs(toNext, timeZone),
  };
}

/** Awal hari lokal (UTC ms) untuk satu tanggal di tz. */
export function startOfDayTz(iso: string, timeZone: string): number {
  return Date.parse(iso + "T00:00:00Z") - tzOffsetMs(iso, timeZone);
}

function tzOffsetMs(iso: string, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(iso + "T00:00:00Z"));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  return asUTC - Date.parse(iso + "T00:00:00Z");
}

/** Kunci tanggal lokal (YYYY-MM-DD) dari timestamp UTC ms di tz. */
export function localDayKey(utcMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utcMs));
}

type DailyPoint = { date: string; amount: number };

/**
 * Zero-fill deret harian: setiap tanggal from..to hadir, berurut, amount ≥ 0.
 * Input ganda pada tanggal sama dijumlahkan.
 */
export function fillDailySeries(
  rows: { paidAtMs: number; amount: number }[],
  from: string,
  to: string,
  timeZone: string
): DailyPoint[] {
  const sums = new Map<string, number>();
  for (const r of rows) {
    const key = localDayKey(r.paidAtMs, timeZone);
    sums.set(key, (sums.get(key) ?? 0) + Math.max(0, Math.trunc(r.amount)));
  }

  const out: DailyPoint[] = [];
  for (let d = from; d <= to; d = shiftISO(d, 1)) {
    out.push({ date: d, amount: sums.get(d) ?? 0 });
  }
  return out;
}

/**
 * Zero-fill deret harian dari bucket SQL (RPC dashboard_daily_revenue —
 * day SUDAH dalam tanggal lokal business tz, tanpa konversi timestamp).
 * Bucket ganda pada tanggal sama dijumlahkan; tanggal kosong → 0.
 */
export function fillDailySeriesFromDays(
  days: { date: string; amount: number }[],
  from: string,
  to: string
): DailyPoint[] {
  const sums = new Map<string, number>();
  for (const d of days) {
    sums.set(d.date, (sums.get(d.date) ?? 0) + Math.max(0, Math.trunc(d.amount)));
  }

  const out: DailyPoint[] = [];
  for (let d = from; d <= to; d = shiftISO(d, 1)) {
    out.push({ date: d, amount: sums.get(d) ?? 0 });
  }
  return out;
}

/** Rata-rata transaksi integer IDR — Math.round half-up (bukan float). */
export function avgTransactionInteger(total: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round(total / count);
}

/** Timezone bisnis default bila kosong (schema businesses.timezone). */
export const DEFAULT_TZ = "Asia/Jakarta";

/**
 * Format tanggal medium (id-ID) pada timezone bisnis. `date` boleh Date,
 * ms, atau ISO string. Fallback tz → Asia/Jakarta. Format tetap
 * `dateStyle: "medium"` (docs/11) — jangan ubah.
 */
export function formatDate(
  date: Date | number | string,
  timeZone: string = DEFAULT_TZ
): string {
  const value =
    date instanceof Date
      ? date
      : new Date(typeof date === "number" ? date : date);
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeZone: timeZone || DEFAULT_TZ,
  }).format(value);
}

/** Format IDR: "Rp 1.250.000" — tanpa desimal. */
export function formatIDR(amount: number): string {
  return "Rp " + new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount);
}

/** Finance — docs/04 §4.4: profit = net − expenses; margin basis-point integer. */
export function profitInteger(netRevenue: number, expenses: number): number {
  return netRevenue - expenses;
}

/** Margin dalam basis point (1% = 100 bp) — integer, tanpa float di API. */
export function marginBp(profit: number, netRevenue: number): number {
  if (netRevenue <= 0) return 0;
  return Math.round((profit / netRevenue) * 10_000);
}

/** Format basis point → "12,5%" untuk tampilan. */
export function formatBp(bp: number): string {
  return `${(bp / 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
}

/** Format nomor transaksi: TX-YYYYMMDD-XXXXXX (docs/04 §4.5). */
export function formatTxNumber(dateKey: string, randHex: string): string {
  return `TX-${dateKey.replace(/-/g, "")}-${randHex.toUpperCase()}`;
}

/** Pertumbuhan revenue periode vs periode sebelumnya, basis point integer. */
export function growthBp(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 10_000 : 0;
  return Math.round(((current - previous) / previous) * 10_000);
}
