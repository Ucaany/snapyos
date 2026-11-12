import { ChevronDown, Tag } from "lucide-react";

import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { BrutalistCheckbox } from "@/components/admin/BrutalistCheckbox";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatIDR } from "@/lib/dashboard-math";
import { createPromoAction, updatePromoAction } from "@/server/admin-actions";
import { listPromos } from "@/server/admin";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Admin Subscription Promos - docs/10 §10.2 (migration 0014).
 * Kode diskon untuk billing plan/subscription (bukan voucher transaksi customer).
 * Semua aksi ter-audit + guarded requireAdmin.
 */

const TYPE_OPTIONS = [
  { value: "percentage", label: "Persentase" },
  { value: "fixed", label: "Nominal (IDR)" },
] as const;

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  // Truncate ke YYYY-MM-DD untuk <input type=date>.
  return iso.slice(0, 10);
}

export default async function AdminPromosPage() {
  const promos = await listPromos();
  const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });

  return (
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <PageHeader
        eyebrow="ADMIN / PROMO LANGGANAN"
        icon={Tag}
        title="Promo Berlangganan"
        meta={`${promos.length} kode promo · diskon billing plan`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Buat Promo Baru</CardTitle>
          <CardDescription>
            Kode 3–32 karakter huruf besar/angka. Untuk persentase, isi 1–100.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminActionForm
            action={createPromoAction}
            submitLabel="Buat Promo"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4"
          >
            <div className="flex flex-col gap-1">
              <label
                htmlFor="promo-code"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Kode
              </label>
              <Input id="promo-code" name="code" placeholder="LAUNCH50" required />
            </div>
            <BrutalistSelect
              name="type"
              label="Tipe"
              defaultValue="percentage"
              options={TYPE_OPTIONS}
            />
            <div className="flex flex-col gap-1">
              <label
                htmlFor="promo-amount"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Nilai (persen atau IDR)
              </label>
              <Input
                id="promo-amount"
                name="amount"
                type="number"
                min={1}
                placeholder="20"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="promo-min-tx"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Min. transaksi (IDR)
              </label>
              <Input
                id="promo-min-tx"
                name="min_transaction"
                type="number"
                min={0}
                defaultValue={0}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="promo-max"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Max diskon (IDR, opsional)
              </label>
              <Input
                id="promo-max"
                name="max_discount"
                type="number"
                min={0}
                placeholder="Kosong = tanpa cap"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="promo-start"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Berlaku mulai (opsional)
              </label>
              <Input id="promo-start" name="start_date" type="date" />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="promo-end"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Berlaku sampai (opsional)
              </label>
              <Input id="promo-end" name="end_date" type="date" />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="promo-limit"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Batas pemakaian (opsional)
              </label>
              <Input
                id="promo-limit"
                name="usage_limit"
                type="number"
                min={0}
                placeholder="Kosong = tak terbatas"
              />
            </div>
            <BrutalistCheckbox
              name="is_active"
              label="Aktifkan segera"
              defaultChecked
              wrapperClassName="col-span-2 md:col-span-4"
            />
          </AdminActionForm>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {promos.length === 0 ? (
          <AdminEmptyState heading="BELUM ADA PROMO" icon={Tag}>
            Buat promo pertama di atas, dipakai saat owner meng-upgrade atau renew plan.
          </AdminEmptyState>
        ) : (
          promos.map((p) => {
            const usageText =
              p.usage_limit === null
                ? `${p.used_count} pemakaian (tak terbatas)`
                : `${p.used_count} / ${p.usage_limit}`;
            const valueText = p.type === "percentage" ? `${p.amount}%` : formatIDR(p.amount);
            return (
              <div
                key={p.id}
                className="border-2 border-ink bg-surface p-4 shadow-hard"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="font-display text-lg uppercase tracking-tight">{p.code}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {p.type.toUpperCase()} · {valueText}
                      {p.max_discount ? ` · max ${formatIDR(p.max_discount)}` : ""}
                      {p.min_transaction > 0 ? ` · min ${formatIDR(p.min_transaction)}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{usageText}</span>
                    <StatusBadge status={p.is_active ? "active" : "inactive"} />
                  </span>
                </div>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {p.start_date ? `MULAI ${dateFmt.format(new Date(p.start_date))}` : "MULAI -"}
                  {" · "}
                  {p.end_date ? `SAMPAI ${dateFmt.format(new Date(p.end_date))}` : "SAMPAI -"}
                </p>

                <details className="mt-4 border-t-2 border-ink/10 pt-4">
                  <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-mono text-xs uppercase tracking-[0.12em]">
                    Edit promo
                    <ChevronDown className="summary-chevron size-3.5" aria-hidden="true" />
                  </summary>
                  <AdminActionForm
                    action={updatePromoAction}
                    hidden={{ promoId: p.id }}
                    submitLabel="Simpan"
                    className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4"
                  >
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`code-${p.id}`}
                        className="font-mono text-[11px] uppercase tracking-[0.12em]"
                      >
                        Kode
                      </label>
                      <Input id={`code-${p.id}`} name="code" defaultValue={p.code} />
                    </div>
                    <BrutalistSelect
                      name="type"
                      label="Tipe"
                      defaultValue={p.type}
                      options={TYPE_OPTIONS}
                    />
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`amt-${p.id}`}
                        className="font-mono text-[11px] uppercase tracking-[0.12em]"
                      >
                        Nilai
                      </label>
                      <Input
                        id={`amt-${p.id}`}
                        name="amount"
                        type="number"
                        defaultValue={p.amount}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`min-${p.id}`}
                        className="font-mono text-[11px] uppercase tracking-[0.12em]"
                      >
                        Min. transaksi
                      </label>
                      <Input
                        id={`min-${p.id}`}
                        name="min_transaction"
                        type="number"
                        defaultValue={p.min_transaction}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`max-${p.id}`}
                        className="font-mono text-[11px] uppercase tracking-[0.12em]"
                      >
                        Max diskon
                      </label>
                      <Input
                        id={`max-${p.id}`}
                        name="max_discount"
                        type="number"
                        defaultValue={p.max_discount ?? ""}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`start-${p.id}`}
                        className="font-mono text-[11px] uppercase tracking-[0.12em]"
                      >
                        Mulai
                      </label>
                      <Input
                        id={`start-${p.id}`}
                        name="start_date"
                        type="date"
                        defaultValue={toDateInput(p.start_date)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`end-${p.id}`}
                        className="font-mono text-[11px] uppercase tracking-[0.12em]"
                      >
                        Sampai
                      </label>
                      <Input
                        id={`end-${p.id}`}
                        name="end_date"
                        type="date"
                        defaultValue={toDateInput(p.end_date)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`limit-${p.id}`}
                        className="font-mono text-[11px] uppercase tracking-[0.12em]"
                      >
                        Batas pemakaian
                      </label>
                      <Input
                        id={`limit-${p.id}`}
                        name="usage_limit"
                        type="number"
                        defaultValue={p.usage_limit ?? ""}
                      />
                    </div>
                    <BrutalistCheckbox
                      name="is_active"
                      label="Aktif"
                      defaultChecked={p.is_active}
                      wrapperClassName="col-span-2 md:col-span-4"
                    />
                  </AdminActionForm>
                </details>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
