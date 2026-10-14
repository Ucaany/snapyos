/**
 * Reports & export — docs/04 §4.16, docs/08 §8.9.
 * CSV (native) + XLSX (ExcelJS) server-side.
 * Sumber aggregate: transactions (source of truth) / expenses / voucher_usages.
 */

import "server-only"
import ExcelJS from "exceljs"
import { createServerClient } from "@/lib/supabase/server"
import { ApiError } from "@/lib/api-errors"
import { can } from "@/lib/rbac"
import { getMembership } from "@/lib/tenant"
import { localDayKey, rangeBoundariesTz, shiftISO } from "@/lib/dashboard-math"
import { reportFilename, toCSV, type ReportTable } from "@/lib/report-csv"
import { reportQuerySchema } from "@/lib/validators"
import { requireFeature } from "@/server/feature-gate"

export type ReportFormat = "csv" | "xlsx"

export type ReportResult = {
  filename: string
  contentType: string
  body: Buffer | string
}

const isoDay = (v: string | null) => (v ? v.slice(0, 10) : "")

/**
 * Plafon baris per sumber data saat ekspor. Rentang sudah dibatasi 366 hari
 * (reportQuerySchema), tapi tenant volume tinggi masih bisa menarik ratusan
 * ribu baris dalam rentang itu, sehingga memori & payload fungsi membengkak
 * tanpa batas. Ambil limit+1 baris: kelebihan satu itu sinyal overflow, bukan
 * data yang ikut diekspor.
 */
const EXPORT_ROW_LIMIT = 50_000

async function requireReport(userId: string, businessId: string) {
  // Membership dulu: businessId asing selalu 404 (bukan 403 FEATURE_DISABLED)
  // agar tidak bocorkan status entitlement bisnis lain (docs/03 §3.5).
  const membership = await getMembership(userId, businessId)
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan")
  if (!can(membership.role, "report:read")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya akses report")
  }
  await requireFeature(businessId, "reports")
  return membership
}

export async function generateReport(
  userId: string,
  businessId: string,
  query: { type?: string; from?: string; to?: string; format?: string }
): Promise<ReportResult> {
  const parsed = reportQuerySchema.parse(query)
  const membership = await requireReport(userId, businessId)
  const tz = membership.business.timezone || "Asia/Jakarta"
  const { startMs, endMs } = rangeBoundariesTz(parsed.from, parsed.to, tz)
  const fromIso = new Date(startMs).toISOString()
  const toIso = new Date(endMs).toISOString()

  const supabase = createServerClient()
  const [tx, expenses, vouchers] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        `number, created_at, paid_at, status, payment_method, gross_amount,
        discount_amount, final_amount, outlet_id, photobox_id, package_id, voucher_id, pos_order_id,
        customers ( name ), packages ( name ), outlets ( name ), photoboxes ( name )`
      )
      .eq("business_id", businessId)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .order("created_at", { ascending: true })
      .limit(EXPORT_ROW_LIMIT + 1),
    supabase
      .from("expenses")
      .select("expense_date, category, amount, note, outlets ( name )")
      .eq("business_id", businessId)
      .gte("expense_date", parsed.from)
      .lte("expense_date", parsed.to)
      .order("expense_date", { ascending: true })
      .limit(EXPORT_ROW_LIMIT + 1),
    supabase
      .from("voucher_usages")
      .select("voucher_id, discount_amount, used_at, vouchers ( code )")
      .eq("business_id", businessId)
      .gte("used_at", fromIso)
      .lt("used_at", toIso)
      .limit(EXPORT_ROW_LIMIT + 1),
  ])
  if (tx.error || expenses.error || vouchers.error) {
    throw new ApiError("INTERNAL", "Gagal memuat data report")
  }

  // Overflow: salah satu sumber melewati plafon, tolak utuh, jangan ekspor
  // berkas yang tampak lengkap padahal terpotong diam-diam.
  if (
    (tx.data?.length ?? 0) > EXPORT_ROW_LIMIT ||
    (expenses.data?.length ?? 0) > EXPORT_ROW_LIMIT ||
    (vouchers.data?.length ?? 0) > EXPORT_ROW_LIMIT
  ) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Data melebihi batas ekspor ${EXPORT_ROW_LIMIT.toLocaleString("id-ID")} baris. Persempit rentang tanggal, lalu ekspor bertahap.`
    )
  }

  type Name = { name: string } | { name: string }[] | null
  const txRows = (tx.data ?? []) as {
    number: string
    created_at: string
    paid_at: string | null
    status: string
    payment_method: string
    gross_amount: number
    discount_amount: number
    final_amount: number
    outlet_id: string
    photobox_id: string
    package_id: string | null
    voucher_id: string | null
    pos_order_id: string | null
    customers?: Name
    packages?: Name
    outlets?: Name
    photoboxes?: Name
  }[]

  const table = buildTable(parsed.type, parsed.from, parsed.to, tz, {
    txRows,
    expenseRows: (expenses.data ?? []) as {
      expense_date: string
      category: string
      amount: number
      note: string | null
      outlets?: Name
    }[],
    voucherRows: (vouchers.data ?? []) as unknown as {
      voucher_id: string
      discount_amount: number
      used_at: string
      vouchers?: { code: string } | { code: string }[] | null
    }[],
  })

  const filename = reportFilename(parsed.type, parsed.from, parsed.to, parsed.format)
  if (parsed.format === "csv") {
    return {
      filename,
      contentType: "text/csv; charset=utf-8",
      body: toCSV(table.headers, table.rows),
    }
  }

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(parsed.type.toUpperCase().slice(0, 31))
  sheet.addRows([table.headers, ...table.rows])
  const body = Buffer.from(await workbook.xlsx.writeBuffer())
  return {
    filename,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    body,
  }
}

function buildTable(
  type: string,
  from: string,
  to: string,
  tz: string,
  data: {
    txRows: {
      number: string
      created_at: string
      paid_at: string | null
      status: string
      payment_method: string
      gross_amount: number
      discount_amount: number
      final_amount: number
      outlet_id: string
      photobox_id: string
      package_id: string | null
      voucher_id: string | null
      pos_order_id: string | null
      customers?: { name: string } | { name: string }[] | null
      packages?: { name: string } | { name: string }[] | null
      outlets?: { name: string } | { name: string }[] | null
      photoboxes?: { name: string } | { name: string }[] | null
    }[]
    expenseRows: {
      expense_date: string
      category: string
      amount: number
      note: string | null
      outlets?: { name: string } | { name: string }[] | null
    }[]
    voucherRows: {
      voucher_id: string
      discount_amount: number
      used_at: string
      vouchers?: { code: string } | { code: string }[] | null
    }[]
  }
): ReportTable {
  const name = (j?: { name: string } | { name: string }[] | null) =>
    j && !Array.isArray(j) ? j.name : ""
  const code = (j?: { code: string } | { code: string }[] | null) =>
    j && !Array.isArray(j) ? j.code : ""

  if (type === "transactions") {
    return {
      headers: [
        "Nomor",
        "Tanggal",
        "Customer",
        "Package",
        "Outlet",
        "Photobox",
        "Metode",
        "Gross",
        "Diskon",
        "Final",
        "Status",
        "Sumber",
      ],
      rows: data.txRows.map((r) => [
        r.number,
        isoDay(r.created_at),
        name(r.customers),
        name(r.packages),
        name(r.outlets),
        name(r.photoboxes),
        r.payment_method,
        r.gross_amount,
        r.discount_amount,
        r.final_amount,
        r.status,
        r.pos_order_id ? "POS" : "KIOSK",
      ]),
    }
  }

  if (type === "expenses") {
    return {
      headers: ["Tanggal", "Kategori", "Outlet", "Nominal", "Catatan"],
      rows: data.expenseRows.map((r) => [
        r.expense_date,
        r.category,
        name(r.outlets),
        r.amount,
        r.note ?? "",
      ]),
    }
  }

  if (type === "voucher") {
    const agg = new Map<string, { code: string; usage: number; discount: number }>()
    for (const v of data.voucherRows) {
      const cur = agg.get(v.voucher_id) ?? {
        code: code(v.vouchers) || v.voucher_id,
        usage: 0,
        discount: 0,
      }
      cur.usage += 1
      cur.discount += v.discount_amount
      agg.set(v.voucher_id, cur)
    }
    return {
      headers: ["Kode", "Total Pemakaian", "Total Diskon"],
      rows: [...agg.values()].map((v) => [v.code, v.usage, v.discount]),
    }
  }

  // Sisa tipe: agregasi periodik / per dimensi dari paid transactions.
  const paid = data.txRows.filter((r) => r.status === "paid" && r.paid_at)
  const bucketOf = (r: { paid_at: string | null }): string => {
    const key = localDayKey(Date.parse(r.paid_at as string), tz)
    if (type === "weekly") {
      const d = new Date(key + "T00:00:00Z")
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
      return d.toISOString().slice(0, 10)
    }
    if (type === "monthly") return key.slice(0, 7)
    return key
  }
  const dimKey =
    type === "outlet"
      ? (r: (typeof paid)[number]) => name(r.outlets) || "—"
      : type === "photobox"
        ? (r: (typeof paid)[number]) => name(r.photoboxes) || "—"
        : type === "revenue"
          ? () => "revenue"
          : bucketOf

  const agg = new Map<string, { net: number; count: number }>()
  for (const r of paid) {
    const key = dimKey(r)
    const cur = agg.get(key) ?? { net: 0, count: 0 }
    cur.net += r.final_amount
    cur.count += 1
    agg.set(key, cur)
  }

  if (type === "outlet" || type === "photobox") {
    const label = type === "outlet" ? "Outlet" : "Photobox"
    return {
      headers: [label, "Transaksi Paid", "Net Revenue"],
      rows: [...agg.entries()]
        .sort((a, b) => b[1].net - a[1].net)
        .map(([k, v]) => [k, v.count, v.net]),
    }
  }

  // daily / weekly / monthly / revenue.
  const days: string[] = []
  for (let d = from; d <= to; d = shiftISO(d, 1)) days.push(d)
  const rows =
    type === "revenue"
      ? [
          [
            `${days[0] ?? from} → ${days[days.length - 1] ?? to}`,
            paid.length,
            paid.reduce((s, r) => s + r.final_amount, 0),
          ],
        ]
      : [...agg.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([k, v]) => [k, v.count, v.net])
  return {
    headers: ["Periode", "Transaksi Paid", "Net Revenue"],
    rows,
  }
}
