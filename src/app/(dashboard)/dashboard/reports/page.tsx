import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Select } from "@/components/ui/select";
import { LABEL_CLASS as labelClass } from "@/lib/form-ui";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { todayISO } from "@/lib/dashboard-math";

export const metadata: Metadata = {
  title: "Laporan: SnapyOS",
};

const REPORT_TYPES = [
  { value: "daily", label: "Harian" },
  { value: "weekly", label: "Mingguan" },
  { value: "monthly", label: "Bulanan" },
  { value: "revenue", label: "Revenue" },
  { value: "transactions", label: "Transactions" },
  { value: "outlet", label: "Outlet" },
  { value: "photobox", label: "Photobox" },
  { value: "expenses", label: "Expenses" },
  { value: "voucher", label: "Voucher" },
];

/** /dashboard/reports — export CSV/XLSX (docs/04 §4.16; PDF future). */
export default async function ReportsPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  if (!can(active.role, "report:read")) {
    return (
      <div className="p-6 md:p-10">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>Akses terbatas</CardTitle>
            <CardDescription>
              Role {active.role.toUpperCase()} tidak punya akses report.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const tz = active.business.timezone || "Asia/Jakarta";
  const today = todayISO(tz);
  const fromDefault = `${today.slice(0, 8)}01`;

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {"LAPORAN: EXPORT"}
        </p>
        <h1 className="mt-2 font-display text-4xl uppercase tracking-tight md:text-5xl">Laporan</h1>
        <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
          Buat laporan dari data transaksi, biaya, dan voucher. Format CSV &amp; XLSX.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Buat Laporan</CardTitle>
          <CardDescription>
            Pilih tipe, rentang tanggal, dan format. File diunduh langsung dari server (butuh sesi
            login aktif).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="report-form"
            method="get"
            action={`/api/v1/business/${active.business.id}/reports`}
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Form report"
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="report-type" className={labelClass}>
                Tipe *
              </label>
              <Select id="report-type" name="type" defaultValue="transactions">
                {REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label.toUpperCase()}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="report-from" className={labelClass}>
                Dari *
              </label>
              <DateInput id="report-from" name="from" required defaultValue={fromDefault} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="report-to" className={labelClass}>
                Sampai *
              </label>
              <DateInput id="report-to" name="to" required defaultValue={today} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="report-format" className={labelClass}>
                Format *
              </label>
              <Select id="report-format" name="format" defaultValue="csv">
                <option value="csv">CSV</option>
                <option value="xlsx">XLSX</option>
              </Select>
            </div>
            <div className="sm:col-span-2 xl:col-span-4">
              <button
                type="submit"
                className="h-11 border-2 border-ink bg-accent px-6 font-mono text-sm font-bold uppercase tracking-[0.08em] shadow-[4px_4px_0_0_#111111] transition-transform active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
              >
                Unduh Report
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
