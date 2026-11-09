import Link from "next/link";
import { Settings } from "lucide-react";

import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { BrutalistCheckbox } from "@/components/admin/BrutalistCheckbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { updateSettingsAction } from "@/server/admin-actions";
import { getPlatformSettings } from "@/server/admin";

/**
 * Admin platform settings - docs/10 §10.4 (key whitelist, uang integer IDR).
 * platform_fee di sini hanya default tampilan - fee efektif dihitung per plan
 * (plans.platform_fee_*, docs/06 §6.6).
 * maintenance_mode di-enforce di middleware (src/middleware.ts).
 */

export default async function AdminSettingsPage() {
  const s = await getPlatformSettings();

  return (
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <PageHeader
        eyebrow="ADMIN - PLATFORM SETTINGS"
        icon={Settings}
        title="Konfigurasi Platform"
        meta="GLOBAL · BERLAKU UNTUK SEMUA TENANT"
      />

      <Card>
        <CardHeader>
          <CardTitle>Settings Global</CardTitle>
          <CardDescription>
            {s.maintenance_mode
              ? "MAINTENANCE MODE SEDANG AKTIF: visitor non-admin diblokir middleware."
              : "Konfigurasi global platform."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminActionForm
            action={updateSettingsAction}
            submitLabel="Simpan pengaturan global"
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            <div className="flex flex-col gap-1">
              <label
                htmlFor="s-fee-pct"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Platform fee default (%)
              </label>
              <Input
                id="s-fee-pct"
                name="platform_fee_percent"
                type="number"
                step="0.5"
                defaultValue={s.platform_fee_percent ?? 0}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Referensi tampilan; fee efektif per-plan.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="s-fee-flat"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Platform fee default flat (IDR)
              </label>
              <Input
                id="s-fee-flat"
                name="platform_fee_flat"
                type="number"
                defaultValue={s.platform_fee_flat ?? 0}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="s-retention"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Default retention (hari)
              </label>
              <Input
                id="s-retention"
                name="default_retention_days"
                type="number"
                min={1}
                max={3}
                step={1}
                defaultValue={s.default_retention_days ?? 3}
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Rentang 1 sampai 3 hari (kebijakan privasi); diterapkan ke semua tenant.
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="s-trial"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Trial (hari)
              </label>
              <Input
                id="s-trial"
                name="trial_days"
                type="number"
                defaultValue={s.trial_days ?? 14}
              />
            </div>

            <div className="flex flex-col gap-1 md:col-span-3">
              <label
                htmlFor="s-maint-msg"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Pesan maintenance (kustom)
              </label>
              <Input
                id="s-maint-msg"
                name="maintenance_message"
                defaultValue={s.maintenance_message ?? ""}
                placeholder="Platform sedang perawatan. Coba lagi nanti."
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Ditampilkan di halaman /maintenance saat mode aktif.
              </p>
            </div>

            <BrutalistCheckbox
              name="maintenance_mode"
              label="Maintenance mode"
              description="Blokir visitor non-admin (middleware 503). Berlaku segera setelah disimpan."
              defaultChecked={Boolean(s.maintenance_mode)}
              wrapperClassName="col-span-1 md:col-span-3"
            />
          </AdminActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Gateway Global</CardTitle>
          <CardDescription>
            Aktifkan atau nonaktifkan provider secara global. Tanpa credential aktif, checkout
            tenant memakai fallback aggregator. Pengaturan per-provider ini juga bisa diubah dari{" "}
            <Link
              href="/admin/gateways"
              className="font-bold underline decoration-ink/40 underline-offset-2"
            >
              /admin/gateways
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminActionForm
            action={updateSettingsAction}
            submitLabel="Simpan gateway global"
            className="grid grid-cols-1 gap-4 md:grid-cols-3"
          >
            <BrutalistCheckbox
              name="gateway_pakasir_enabled"
              label="Pakasir"
              description="Aggregator + direct merchant."
              defaultChecked={s.gateway_pakasir_enabled !== false}
            />
            <BrutalistCheckbox
              name="gateway_midtrans_enabled"
              label="Midtrans"
              description="Direct merchant owner."
              defaultChecked={s.gateway_midtrans_enabled !== false}
            />
            <BrutalistCheckbox
              name="gateway_tripay_enabled"
              label="Tripay"
              description="Direct merchant owner."
              defaultChecked={s.gateway_tripay_enabled !== false}
            />
          </AdminActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
