import { CheckCircle2, CreditCard, LayoutGrid, Percent, Wallet } from "lucide-react";

import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminDisclosure } from "@/components/admin/AdminDisclosureCard";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionHeading } from "@/components/admin/AdminSectionHeading";
import { AdminStatGrid } from "@/components/admin/AdminStatGrid";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminCheckbox } from "@/components/admin/AdminCheckbox";
import { AdminSelect } from "@/components/admin/AdminSelect";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import { Input } from "@/components/admin/ui/input";
import { formatIDR } from "@/lib/dashboard-math";
import { cycleLabel, cycleUnit, monthlyEquivalent } from "@/lib/subscription-math";
import { createPlanAction, updatePlanAction } from "@/server/admin-actions";
import { listPlans } from "@/server/admin";
import { Label } from "@/components/admin/ui/label";

/**
 * Admin plans - create/edit harga, limits (incl.
 * max_concurrent_sessions), feature flags, platform fee, active (docs/10 §10.2).
 * Harga plan SELALU dari table plans - tidak pernah hardcode (docs/12).
 */

/**
 * Union key fallback stabil — mencakup 12 key seed plan (db/schema.sql §plans)
 * + pwa_kiosk. Key di luar daftar ini (ditambah lewat data) tetap dirender
 * dengan label humanized, jadi tidak ada flag yang hilang dari form (M4).
 */
const KNOWN_FEATURE_KEYS = [
  "voucher",
  "finance",
  "reports",
  "custom_domain",
  "white_label",
  "staff",
  "event_mode",
  "booking",
  "qr_delivery",
  "direct_payment",
  "storage",
  "cash_payment",
  "pwa_kiosk",
] as const;

const FEATURE_LABELS: Record<string, string> = {
  voucher: "Voucher",
  finance: "Finance",
  reports: "Reports",
  custom_domain: "Custom Domain",
  white_label: "White Label",
  staff: "Staff",
  event_mode: "Event Mode",
  booking: "Booking",
  qr_delivery: "Kirim via QR",
  direct_payment: "Direct Payment Gateway",
  storage: "Storage",
  cash_payment: "Bayar di Kasir",
  pwa_kiosk: "PWA Kiosk (Android/Tablet/iOS)",
};

function featureLabel(key: string): string {
  return FEATURE_LABELS[key] ?? key.replace(/_/g, " ");
}

/** Union key dari fallback stabil + semua key yang benar-benar ada di plans. */
function featureKeysFrom(plans: { features: Record<string, boolean> }[]): string[] {
  const keys = new Set<string>(KNOWN_FEATURE_KEYS);
  for (const plan of plans) {
    for (const key of Object.keys(plan.features ?? {})) keys.add(key);
  }
  return [...keys];
}

function Field({
  id,
  label,
  name,
  defaultValue,
  type = "text",
  step,
  placeholder,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        type={type}
        step={step}
        defaultValue={defaultValue}
        placeholder={placeholder}
      />
    </div>
  );
}

export default async function AdminPlansPage() {
  const plans = await listPlans();
  const featureKeys = featureKeysFrom(plans);
  const activePlans = plans.filter((plan) => plan.is_active).length;
  const minPrice = plans.length
    ? Math.min(...plans.map((plan) => monthlyEquivalent(plan.price, plan.billing_cycle)))
    : 0;
  const avgFee = plans.length
    ? plans.reduce((total, plan) => total + plan.platform_fee_percent, 0) / plans.length
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={CreditCard}
        title="Manajemen Paket"
        meta="Harga · limit sesi konkuren · feature flags · platform fee"
      />

      <section aria-labelledby="admin-plans-metrics" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-plans-metrics"
          title="Ikhtisar"
          description="Katalog paket dan harga yang tersedia untuk owner."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            accent
            tone="emerald"
            icon={CheckCircle2}
            label="Paket aktif"
            value={String(activePlans)}
            sub={`${plans.length - activePlans} nonaktif`}
          />
          <AdminMetricCard
            tone="neutral"
            icon={LayoutGrid}
            label="Total paket"
            value={String(plans.length)}
            sub="Seluruh katalog"
          />
          <AdminMetricCard
            tone="sky"
            icon={Wallet}
            label="Harga terendah"
            value={formatIDR(minPrice)}
            sub="Per bulan (setara)"
          />
          <AdminMetricCard
            tone="amber"
            icon={Percent}
            label="Fee rata-rata"
            value={`${avgFee.toFixed(1).replace(".", ",")}%`}
            sub="Platform fee persen"
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Buat Plan Baru</CardTitle>
          <CardDescription>
            Plan seed (Starter/Growth/Business) hanya contoh - semuanya editable di sini. Feature
            flags & aktif dapat di-set langsung saat create.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminActionForm
            action={createPlanAction}
            submitLabel="Buat Plan"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4"
          >
            <Field id="new-code" label="Kode" name="code" placeholder="starter" />
            <Field id="new-name" label="Nama" name="name" placeholder="Starter" />
            <Field
              id="new-price"
              label="Harga / siklus (IDR)"
              name="price"
              type="number"
              defaultValue={99000}
            />
            <Field
              id="new-biz"
              label="Max Bisnis"
              name="max_businesses"
              type="number"
              defaultValue={1}
            />
            <Field
              id="new-outlets"
              label="Max Outlet"
              name="max_outlets"
              type="number"
              defaultValue={1}
            />
            <Field
              id="new-boxes"
              label="Max Photobox"
              name="max_photoboxes"
              type="number"
              defaultValue={1}
            />
            <Field
              id="new-packages"
              label="Max Paket Foto"
              name="max_packages"
              type="number"
              defaultValue={50}
            />
            <Field
              id="new-templates"
              label="Max Template"
              name="max_templates"
              type="number"
              defaultValue={50}
            />
            <Field
              id="new-sessions"
              label="Max Sesi Konkuren"
              name="max_concurrent_sessions"
              type="number"
              defaultValue={1}
            />
            <Field
              id="new-staff"
              label="Max Staff"
              name="max_staff"
              type="number"
              defaultValue={1}
            />
            <Field
              id="new-storage"
              label="Storage Limit (MB)"
              name="storage_limit_mb"
              type="number"
              defaultValue={1024}
            />
            <Field
              id="new-fee-pct"
              label="Platform Fee %"
              name="platform_fee_percent"
              type="number"
              step="0.5"
              defaultValue={0}
            />
            <Field
              id="new-fee-flat"
              label="Platform Fee Flat (IDR)"
              name="platform_fee_flat"
              type="number"
              defaultValue={0}
            />
            <AdminSelect
              id="new-cycle"
              name="billing_cycle"
              label="Siklus Billing"
              defaultValue="monthly"
              options={[
                { value: "daily", label: "Harian" },
                { value: "weekly", label: "Mingguan" },
                { value: "monthly", label: "Bulanan" },
                { value: "yearly", label: "Tahunan" },
              ]}
            />
            <div className="col-span-1 flex flex-col gap-2 sm:col-span-2 md:col-span-4">
              <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <legend className="mb-2 w-full text-xs font-medium text-muted-foreground">
                  Feature flags (default: nonaktif)
                </legend>
                {featureKeys.map((key) => (
                  <AdminCheckbox
                    key={key}
                    name={`feature_${key}`}
                    label={featureLabel(key)}
                    defaultChecked={false}
                  />
                ))}
              </fieldset>
              <AdminCheckbox
                name="is_active"
                label="Plan aktif (bisa dipilih owner)"
                defaultChecked
              />
            </div>
          </AdminActionForm>
        </CardContent>
      </Card>

      <section aria-labelledby="admin-plans-catalog" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-plans-catalog"
          title="Katalog paket"
          description={`${plans.length} paket terdaftar · ${activePlans} aktif.`}
        />

        <div className="flex flex-col gap-4">
          {plans.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <CardDescription>
                  {p.code.toUpperCase()} · {cycleLabel(p.billing_cycle)} ·{" "}
                  {formatIDR(p.price)}/{cycleUnit(p.billing_cycle)}
                </CardDescription>
                <CardAction>
                  <AdminStatusBadge status={p.is_active ? "active" : "inactive"} />
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <AdminStatGrid
                  items={[
                    {
                      label: "Harga per siklus",
                      value: `${formatIDR(p.price)}/${cycleUnit(p.billing_cycle)}`,
                    },
                    {
                      label: "Siklus billing",
                      value: cycleLabel(p.billing_cycle),
                    },
                    { label: "Sesi konkuren", value: String(p.max_concurrent_sessions) },
                    {
                      label: "Bisnis / Outlet / Booth",
                      value: `${p.max_businesses} / ${p.max_outlets} / ${p.max_photoboxes}`,
                    },
                    { label: "Staff", value: String(p.max_staff) },
                    {
                      label: "Paket foto / Template",
                      value: `${p.max_packages} / ${p.max_templates}`,
                    },
                    { label: "Storage", value: `${p.storage_limit_mb} MB` },
                    { label: "Fee %", value: String(p.platform_fee_percent) },
                    { label: "Fee flat", value: formatIDR(p.platform_fee_flat) },
                  ]}
                />
                <AdminDisclosure
                  className="border-t pt-3"
                  triggerClassName="min-h-11 text-xs font-medium text-muted-foreground hover:text-foreground"
                  trigger={<span>Edit paket</span>}
                >
                  <AdminActionForm
                    action={updatePlanAction}
                    hidden={{ planId: p.id }}
                    submitLabel="Simpan Perubahan"
                    className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4"
                  >
                    <Field id={`name-${p.id}`} label="Nama" name="name" defaultValue={p.name} />
                    <Field
                      id={`price-${p.id}`}
                      label="Harga / siklus"
                      name="price"
                      type="number"
                      defaultValue={p.price}
                    />
                    <Field
                      id={`biz-${p.id}`}
                      label="Max Bisnis"
                      name="max_businesses"
                      type="number"
                      defaultValue={p.max_businesses}
                    />
                    <Field
                      id={`outlets-${p.id}`}
                      label="Max Outlet"
                      name="max_outlets"
                      type="number"
                      defaultValue={p.max_outlets}
                    />
                    <Field
                      id={`boxes-${p.id}`}
                      label="Max Photobox"
                      name="max_photoboxes"
                      type="number"
                      defaultValue={p.max_photoboxes}
                    />
                    <Field
                      id={`packages-${p.id}`}
                      label="Max Paket Foto"
                      name="max_packages"
                      type="number"
                      defaultValue={p.max_packages}
                    />
                    <Field
                      id={`templates-${p.id}`}
                      label="Max Template"
                      name="max_templates"
                      type="number"
                      defaultValue={p.max_templates}
                    />
                    <Field
                      id={`sessions-${p.id}`}
                      label="Sesi konkuren"
                      name="max_concurrent_sessions"
                      type="number"
                      defaultValue={p.max_concurrent_sessions}
                    />
                    <Field
                      id={`staff-${p.id}`}
                      label="Max Staff"
                      name="max_staff"
                      type="number"
                      defaultValue={p.max_staff}
                    />
                    <Field
                      id={`storage-${p.id}`}
                      label="Storage Limit (MB)"
                      name="storage_limit_mb"
                      type="number"
                      defaultValue={p.storage_limit_mb}
                    />
                    <Field
                      id={`fee-pct-${p.id}`}
                      label="Fee %"
                      name="platform_fee_percent"
                      type="number"
                      step="0.5"
                      defaultValue={p.platform_fee_percent}
                    />
                    <Field
                      id={`fee-flat-${p.id}`}
                      label="Fee flat"
                      name="platform_fee_flat"
                      type="number"
                      defaultValue={p.platform_fee_flat}
                    />
                    <AdminSelect
                      id={`cycle-${p.id}`}
                      name="billing_cycle"
                      label="Siklus Billing"
                      defaultValue={p.billing_cycle}
                      options={[
                        { value: "daily", label: "Harian" },
                        { value: "weekly", label: "Mingguan" },
                        { value: "monthly", label: "Bulanan" },
                        { value: "yearly", label: "Tahunan" },
                      ]}
                    />
                    <p className="col-span-1 text-xs text-muted-foreground sm:col-span-2 md:col-span-4">
                      Mengubah siklus hanya berlaku untuk pembelian baru; subscription lama
                      memakai snapshot siklusnya. Pastikan harga sesuai siklus baru sebelum
                      menyimpan.
                    </p>
                    <div className="col-span-1 flex flex-col gap-2 sm:col-span-2 md:col-span-4">
                      <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        <legend className="mb-2 w-full text-xs font-medium text-muted-foreground">
                          Feature flags
                        </legend>
                        {featureKeys.map((key) => (
                          <AdminCheckbox
                            key={key}
                            name={`feature_${key}`}
                            label={featureLabel(key)}
                            defaultChecked={Boolean(p.features?.[key])}
                          />
                        ))}
                      </fieldset>
                      <AdminCheckbox
                        name="is_active"
                        label="Plan aktif (bisa dipilih owner)"
                        defaultChecked={p.is_active}
                      />
                    </div>
                  </AdminActionForm>
                </AdminDisclosure>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
