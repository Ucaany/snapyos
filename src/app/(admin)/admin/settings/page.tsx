import Link from "next/link";
import { Clock, Percent, Settings, ShieldAlert, Timer } from "lucide-react";

import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionHeading } from "@/components/admin/AdminSectionHeading";
import { AdminCheckbox } from "@/components/admin/AdminCheckbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import { Switch } from "@/components/admin/ui/switch";
import { formatIDR } from "@/lib/dashboard-math";
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
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={Settings}
        title="Konfigurasi Platform"
        meta="Global · berlaku untuk semua tenant"
      />

      <section aria-labelledby="admin-settings-metrics" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-settings-metrics"
          title="Ikhtisar"
          description="Nilai global yang memengaruhi seluruh tenant dan checkout."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            accent
            tone="emerald"
            icon={Percent}
            label="Fee platform default"
            value={`${s.platform_fee_percent ?? 0}%`}
            sub={`Flat ${formatIDR(s.platform_fee_flat ?? 0)}`}
          />
          <AdminMetricCard
            tone="sky"
            icon={Clock}
            label="Retensi default"
            value={`${s.default_retention_days ?? 3} hari`}
            sub="Kebijakan privasi tenant"
          />
          <AdminMetricCard
            tone="sky"
            icon={Timer}
            label="Trial default"
            value={`${s.trial_days ?? 14} hari`}
            sub="Masa uji coba langganan"
          />
          <AdminMetricCard
            tone="amber"
            icon={ShieldAlert}
            label="Maintenance mode"
            value={s.maintenance_mode ? "Aktif" : "Nonaktif"}
            sub="Blokir visitor non-admin"
          />
        </div>
      </section>

      <section aria-labelledby="admin-settings-global" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-settings-global"
          title="Pengaturan global"
          description="Fee default, retensi, trial, dan pesan maintenance."
        />

        <Card>
          <CardHeader>
            <CardTitle>Settings global</CardTitle>
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
                <Label htmlFor="s-fee-pct" className="text-xs font-medium text-muted-foreground">
                  Platform fee default (%)
                </Label>
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
                <Label htmlFor="s-fee-flat" className="text-xs font-medium text-muted-foreground">
                  Platform fee default flat (IDR)
                </Label>
                <Input
                  id="s-fee-flat"
                  name="platform_fee_flat"
                  type="number"
                  defaultValue={s.platform_fee_flat ?? 0}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="s-retention" className="text-xs font-medium text-muted-foreground">
                  Default retention (hari)
                </Label>
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
                <Label htmlFor="s-trial" className="text-xs font-medium text-muted-foreground">
                  Trial (hari)
                </Label>
                <Input
                  id="s-trial"
                  name="trial_days"
                  type="number"
                  defaultValue={s.trial_days ?? 14}
                />
              </div>

              <div className="flex flex-col gap-1 md:col-span-3">
                <Label htmlFor="s-maint-msg" className="text-xs font-medium text-muted-foreground">
                  Pesan maintenance (kustom)
                </Label>
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

              <div className="col-span-1 flex items-start justify-between gap-4 border-t pt-3 md:col-span-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Label htmlFor="maintenance_mode" className="text-sm font-medium">
                    Maintenance mode
                  </Label>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Blokir visitor non-admin (middleware 503). Berlaku segera setelah disimpan.
                  </p>
                </div>
                <Switch
                  id="maintenance_mode"
                  name="maintenance_mode"
                  value="true"
                  uncheckedValue="false"
                  defaultChecked={Boolean(s.maintenance_mode)}
                />
              </div>
            </AdminActionForm>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="admin-settings-gateways" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-settings-gateways"
          title="Gateway global"
          description="Aktifkan atau nonaktifkan provider untuk seluruh tenant."
        />

        <Card>
          <CardHeader>
            <CardTitle>Gateway global</CardTitle>
            <CardDescription>
              Aktifkan atau nonaktifkan provider secara global. Tanpa credential aktif, kiosk hanya
              menerima voucher dan tunai. Pengaturan per-provider ini juga bisa diubah dari{" "}
              <Link
                href="/admin/gateways"
                className="font-medium underline decoration-muted-foreground/40 underline-offset-2"
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
              className="grid grid-cols-1 gap-4 md:grid-cols-2"
            >
              <AdminCheckbox
                name="gateway_midtrans_enabled"
                label="Midtrans"
                description="Direct merchant owner."
                defaultChecked={s.gateway_midtrans_enabled !== false}
              />
              <AdminCheckbox
                name="gateway_tripay_enabled"
                label="Tripay"
                description="Direct merchant owner."
                defaultChecked={s.gateway_tripay_enabled !== false}
              />
            </AdminActionForm>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
