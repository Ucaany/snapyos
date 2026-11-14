import { Tag } from "lucide-react";

import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminDisclosure } from "@/components/admin/AdminDisclosureCard";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminCheckbox } from "@/components/admin/AdminCheckbox";
import { AdminSelect } from "@/components/admin/AdminSelect";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import { Input } from "@/components/admin/ui/input";
import { formatIDR } from "@/lib/dashboard-math";
import { createPromoAction, updatePromoAction } from "@/server/admin-actions";
import { listPromos } from "@/server/admin";
import { Label } from "@/components/admin/ui/label";

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
    <div className="flex flex-col gap-6">
      <AdminPageHeader
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
              <Label htmlFor="promo-code" className="text-xs font-medium text-muted-foreground">
                Kode
              </Label>
              <Input id="promo-code" name="code" placeholder="LAUNCH50" required />
            </div>
            <AdminSelect
              name="type"
              label="Tipe"
              defaultValue="percentage"
              options={TYPE_OPTIONS}
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="promo-amount" className="text-xs font-medium text-muted-foreground">
                Nilai (persen atau IDR)
              </Label>
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
              <Label htmlFor="promo-min-tx" className="text-xs font-medium text-muted-foreground">
                Min. transaksi (IDR)
              </Label>
              <Input
                id="promo-min-tx"
                name="min_transaction"
                type="number"
                min={0}
                defaultValue={0}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="promo-max" className="text-xs font-medium text-muted-foreground">
                Max diskon (IDR, opsional)
              </Label>
              <Input
                id="promo-max"
                name="max_discount"
                type="number"
                min={0}
                placeholder="Kosong = tanpa cap"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="promo-start" className="text-xs font-medium text-muted-foreground">
                Berlaku mulai (opsional)
              </Label>
              <Input id="promo-start" name="start_date" type="date" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="promo-end" className="text-xs font-medium text-muted-foreground">
                Berlaku sampai (opsional)
              </Label>
              <Input id="promo-end" name="end_date" type="date" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="promo-limit" className="text-xs font-medium text-muted-foreground">
                Batas pemakaian (opsional)
              </Label>
              <Input
                id="promo-limit"
                name="usage_limit"
                type="number"
                min={0}
                placeholder="Kosong = tak terbatas"
              />
            </div>
            <AdminCheckbox
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
          <AdminEmptyState heading="Belum ada promo" icon={Tag}>
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
              <Card key={p.id}>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="text-base font-medium tracking-tight">{p.code}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.type.toUpperCase()} · {valueText}
                        {p.max_discount ? ` · max ${formatIDR(p.max_discount)}` : ""}
                        {p.min_transaction > 0 ? ` · min ${formatIDR(p.min_transaction)}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{usageText}</span>
                      <AdminStatusBadge status={p.is_active ? "active" : "inactive"} />
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.start_date ? `MULAI ${dateFmt.format(new Date(p.start_date))}` : "MULAI -"}
                    {" · "}
                    {p.end_date ? `SAMPAI ${dateFmt.format(new Date(p.end_date))}` : "SAMPAI -"}
                  </p>

                  <AdminDisclosure
                    className="border-t pt-3"
                    triggerClassName="min-h-9 text-xs font-medium text-muted-foreground hover:text-foreground"
                    trigger={<span>Edit promo</span>}
                  >
                    <AdminActionForm
                      action={updatePromoAction}
                      hidden={{ promoId: p.id }}
                      submitLabel="Simpan"
                      className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4"
                    >
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`code-${p.id}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Kode
                        </Label>
                        <Input id={`code-${p.id}`} name="code" defaultValue={p.code} />
                      </div>
                      <AdminSelect
                        name="type"
                        label="Tipe"
                        defaultValue={p.type}
                        options={TYPE_OPTIONS}
                      />
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`amt-${p.id}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Nilai
                        </Label>
                        <Input
                          id={`amt-${p.id}`}
                          name="amount"
                          type="number"
                          defaultValue={p.amount}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`min-${p.id}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Min. transaksi
                        </Label>
                        <Input
                          id={`min-${p.id}`}
                          name="min_transaction"
                          type="number"
                          defaultValue={p.min_transaction}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`max-${p.id}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Max diskon
                        </Label>
                        <Input
                          id={`max-${p.id}`}
                          name="max_discount"
                          type="number"
                          defaultValue={p.max_discount ?? ""}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`start-${p.id}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Mulai
                        </Label>
                        <Input
                          id={`start-${p.id}`}
                          name="start_date"
                          type="date"
                          defaultValue={toDateInput(p.start_date)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`end-${p.id}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Sampai
                        </Label>
                        <Input
                          id={`end-${p.id}`}
                          name="end_date"
                          type="date"
                          defaultValue={toDateInput(p.end_date)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`limit-${p.id}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Batas pemakaian
                        </Label>
                        <Input
                          id={`limit-${p.id}`}
                          name="usage_limit"
                          type="number"
                          defaultValue={p.usage_limit ?? ""}
                        />
                      </div>
                      <AdminCheckbox
                        name="is_active"
                        label="Aktif"
                        defaultChecked={p.is_active}
                        wrapperClassName="col-span-2 md:col-span-4"
                      />
                    </AdminActionForm>
                  </AdminDisclosure>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
