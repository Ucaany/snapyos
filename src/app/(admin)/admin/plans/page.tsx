import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatIDR } from "@/lib/dashboard-math";
import { createPlanAction, updatePlanAction } from "@/server/admin-actions";
import { listPlans } from "@/server/admin";

/**
 * Admin plans - create/edit harga, limits (incl.
 * max_concurrent_sessions), feature flags, platform fee, active (docs/10 §10.2).
 * Harga plan SELALU dari table plans - tidak pernah hardcode (docs/12).
 */

const FEATURE_KEYS = [
  "voucher",
  "finance",
  "reports",
  "staff",
  "direct_payment",
  "storage",
  "cash_payment",
  "pwa_kiosk",
] as const;

const FEATURE_LABELS: Record<string, string> = {
  voucher: "Voucher",
  finance: "Finance",
  reports: "Reports",
  staff: "Staff",
  direct_payment: "Direct Payment Gateway",
  storage: "Storage",
  cash_payment: "Bayar di Kasir",
  pwa_kiosk: "PWA Kiosk (Android/Tablet/iOS)",
};

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
      <label htmlFor={id} className="font-mono text-[10px] uppercase tracking-[0.12em]">
        {label}
      </label>
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

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {"ADMIN - PLANS"}
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-tight md:text-4xl">
          Manajemen Plan
        </h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          HARGA · LIMIT SESI KONKUREN · FEATURE FLAGS · PLATFORM FEE
        </p>
      </header>

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
            className="grid grid-cols-2 gap-4 md:grid-cols-4"
          >
            <Field id="new-code" label="Kode" name="code" placeholder="starter" />
            <Field id="new-name" label="Nama" name="name" placeholder="Starter" />
            <Field
              id="new-price"
              label="Harga / bln (IDR)"
              name="price_monthly"
              type="number"
              defaultValue={99000}
            />
            <Field
              id="new-price-yearly"
              label="Harga / thn (IDR)"
              name="price_yearly"
              type="number"
              defaultValue={990000}
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
            <div className="flex flex-col gap-1">
              <label
                htmlFor="new-cycle"
                className="font-mono text-[10px] uppercase tracking-[0.12em]"
              >
                Siklus Billing
              </label>
              <select
                id="new-cycle"
                name="billing_cycle"
                defaultValue="monthly"
                className="h-8 w-full min-w-0 rounded-none border-2 border-ink bg-surface px-2.5 text-sm text-ink outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ink"
              >
                <option value="monthly">Bulanan</option>
                <option value="yearly">Tahunan</option>
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-2 md:col-span-4">
              <fieldset className="flex flex-wrap gap-3">
                <legend className="mb-2 w-full font-mono text-[10px] uppercase tracking-[0.12em]">
                  Feature flags (default: nonaktif)
                </legend>
                {FEATURE_KEYS.map((key) => (
                  <label key={key} className="flex items-center gap-2 font-mono text-xs uppercase">
                    <input type="hidden" name={`feature_${key}`} value="false" />
                    <input
                      type="checkbox"
                      name={`feature_${key}`}
                      value="true"
                      className="size-4 accent-[#ffd400]"
                    />
                    {FEATURE_LABELS[key] ?? key.replace(/_/g, " ")}
                  </label>
                ))}
              </fieldset>
              <label className="flex items-center gap-2 font-mono text-xs uppercase">
                <input type="hidden" name="is_active" value="false" />
                <input
                  type="checkbox"
                  name="is_active"
                  value="true"
                  defaultChecked
                  className="size-4 accent-[#ffd400]"
                />
                Plan aktif (bisa dipilih owner)
              </label>
            </div>
          </AdminActionForm>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6">
        {plans.map((p) => (
          <details
            key={p.id}
            className="border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]"
          >
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4">
              <span className="flex items-center gap-3">
                <span className="font-display text-lg uppercase tracking-tight">{p.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
              </span>
              <span className="flex items-center gap-3 font-mono text-xs font-bold">
                {formatIDR(p.price_monthly)}/BLN
                {p.billing_cycle === "yearly" && p.price_yearly != null
                  ? ` · ${formatIDR(p.price_yearly)}/THN`
                  : ""}
                <StatusBadge status={p.is_active ? "active" : "inactive"} />
              </span>
            </summary>
            <div className="border-t-2 border-ink/10 p-4">
              <dl className="mb-4 grid grid-cols-2 gap-[2px] border-2 border-ink/20 bg-ink/20 md:grid-cols-4">
                {[
                  {
                    label: "Harga tahunan",
                    value: p.price_yearly != null ? formatIDR(p.price_yearly) : "-",
                  },
                  {
                    label: "Siklus billing",
                    value: p.billing_cycle === "yearly" ? "Tahunan" : "Bulanan",
                  },
                  { label: "Sesi konkuren", value: String(p.max_concurrent_sessions) },
                  {
                    label: "Bisnis / Outlet / Booth",
                    value: `${p.max_businesses} / ${p.max_outlets} / ${p.max_photoboxes}`,
                  },
                  { label: "Staff", value: String(p.max_staff) },
                  { label: "Storage", value: `${p.storage_limit_mb} MB` },
                  { label: "Fee %", value: String(p.platform_fee_percent) },
                  { label: "Fee flat", value: formatIDR(p.platform_fee_flat) },
                ].map((cell) => (
                  <div key={cell.label} className="flex flex-col gap-1 bg-surface p-3">
                    <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {cell.label}
                    </dt>
                    <dd className="font-mono text-xs font-bold uppercase">{cell.value}</dd>
                  </div>
                ))}
              </dl>
              <AdminActionForm
                action={updatePlanAction}
                hidden={{ planId: p.id }}
                submitLabel="Simpan Perubahan"
                className="grid grid-cols-2 gap-4 md:grid-cols-4"
              >
                <Field id={`name-${p.id}`} label="Nama" name="name" defaultValue={p.name} />
                <Field
                  id={`price-${p.id}`}
                  label="Harga / bln"
                  name="price_monthly"
                  type="number"
                  defaultValue={p.price_monthly}
                />
                <Field
                  id={`price-yearly-${p.id}`}
                  label="Harga / thn"
                  name="price_yearly"
                  type="number"
                  defaultValue={p.price_yearly ?? ""}
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
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor={`cycle-${p.id}`}
                    className="font-mono text-[10px] uppercase tracking-[0.12em]"
                  >
                    Siklus Billing
                  </label>
                  <select
                    id={`cycle-${p.id}`}
                    name="billing_cycle"
                    defaultValue={p.billing_cycle}
                    className="h-8 w-full min-w-0 rounded-none border-2 border-ink bg-surface px-2.5 text-sm text-ink outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ink"
                  >
                    <option value="monthly">Bulanan</option>
                    <option value="yearly">Tahunan</option>
                  </select>
                </div>
                <div className="col-span-2 flex flex-col gap-2 md:col-span-4">
                  <fieldset className="flex flex-wrap gap-3">
                    <legend className="mb-2 w-full font-mono text-[10px] uppercase tracking-[0.12em]">
                      Feature flags
                    </legend>
                    {FEATURE_KEYS.map((key) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 font-mono text-xs uppercase"
                      >
                        {/* hidden "false" dulu → unchecked tetap terkirim (H2 audit) */}
                        <input type="hidden" name={`feature_${key}`} value="false" />
                        <input
                          type="checkbox"
                          name={`feature_${key}`}
                          value="true"
                          defaultChecked={Boolean(p.features?.[key])}
                          className="size-4 accent-[#ffd400]"
                        />
                        {FEATURE_LABELS[key] ?? key.replace(/_/g, " ")}
                      </label>
                    ))}
                  </fieldset>
                  <label className="flex items-center gap-2 font-mono text-xs uppercase">
                    {/* hidden "false" dulu → unchecked tetap terkirim (H2 audit) */}
                    <input type="hidden" name="is_active" value="false" />
                    <input
                      type="checkbox"
                      name="is_active"
                      value="true"
                      defaultChecked={p.is_active}
                      className="size-4 accent-[#ffd400]"
                    />
                    Plan aktif (bisa dipilih owner)
                  </label>
                </div>
              </AdminActionForm>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
