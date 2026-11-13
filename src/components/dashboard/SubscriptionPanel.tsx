import type { ReactNode } from "react";
import { Check, Download, Minus, Plus, QrCode } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IconLink } from "@/components/ui/icon-button";
import { RecordCard } from "@/components/ui/record-card";
import { RecordCollection } from "@/components/ui/record-collection";
import { SubscriptionCheckoutTrigger } from "@/components/dashboard/SubscriptionCheckoutTrigger";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import {
  CancelAddOnButton,
  CancelSubscriptionForm,
  ResumeSubscriptionForm,
} from "@/components/dashboard/SubscriptionActions";
import { formatIDR } from "@/lib/dashboard-math";
import { usagePercent } from "@/lib/subscription-math";
import type {
  ActiveAddOn,
  AddOnCard,
  InvoiceRow,
  PlanCard,
  SubscriptionOverview,
} from "@/server/subscription";

type Props = {
  subscription: SubscriptionOverview["subscription"];
  usage: SubscriptionOverview["usage"];
  invoices: InvoiceRow[];
  plans: PlanCard[];
  addOns: AddOnCard[];
  canWrite: boolean;
};

const FEATURE_LABELS: Record<string, string> = {
  direct_payment: "Payment gateway merchant langsung",
  staff: "Manajemen staff",
  finance: "Keuangan / settlement",
  storage: "Penyimpanan",
  reports: "Laporan",
  voucher: "Voucher",
  cash_payment: "Bayar di kasir",
  pwa_kiosk: "PWA kiosk (Android/Tablet/iOS)",
  custom_domain: "Domain kustom",
  white_label: "White label",
  event_mode: "Mode event",
  booking: "Booking",
  qr_delivery: "Kirim via QR",
};

function featureLabel(key: string): string {
  return FEATURE_LABELS[key] ?? key.replace(/_/g, " ");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Sisa hari sampai tanggal berakhir; null bila tanggal tidak valid. */
function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.ceil((ms - Date.now()) / (24 * 60 * 60 * 1000)));
}

function daysLeftLabel(iso: string | null): string {
  const days = daysLeft(iso);
  if (days === null) return "";
  return days === 0 ? " · kedaluwarsa" : ` · sisa ${days} hari`;
}

const INVOICE_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  paid: "Lunas",
  void: "Dibatalkan",
};

function invoiceStatusLabel(status: string): string {
  return INVOICE_STATUS_LABEL[status] ?? status;
}

const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = {
  trial: "Uji coba",
  active: "Aktif",
  past_due: "Tertunggak",
  cancelled: "Dibatalkan",
  canceled: "Dibatalkan",
  expired: "Kedaluwarsa",
  pending: "Menunggu",
};

function subscriptionStatusLabel(status: string | undefined): string {
  if (!status) return "-";
  return SUBSCRIPTION_STATUS_LABEL[status] ?? status;
}

function UsageRow({
  label,
  used,
  max,
  hint,
}: {
  label: string;
  used: number;
  max: number;
  hint?: string;
}) {
  const included = Number.isFinite(max) && max > 0;
  const pct = included ? usagePercent(used, max) : 0;
  const meterMax = Math.max(1, max);
  return (
    <div className="flex flex-col gap-1 border-b-2 border-ink/10 py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-xs font-bold tabular-nums">
          {included ? `${used} / ${max}` : "-"}
        </span>
      </div>
      <div
        className="h-2 w-full rounded-none border-2 border-ink bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={meterMax}
        aria-valuenow={included ? Math.min(used, meterMax) : 0}
        aria-label={`Pemakaian ${label}`}
      >
        <div
          className={`h-full rounded-none ${included && pct >= 100 ? "bg-destructive" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!included && (
        <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
          Tidak termasuk plan
        </p>
      )}
      {hint && (
        <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function PlanCardBlock({
  plan,
  isCurrent,
  trigger,
}: {
  plan: PlanCard;
  isCurrent: boolean;
  trigger?: ReactNode;
}) {
  return (
    <Card className={`h-full ${isCurrent ? "bg-accent" : ""}`}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{plan.name}</CardTitle>
          {isCurrent && (
            <span className="border-2 border-ink bg-ink px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-bg">
              Paket kamu
            </span>
          )}
        </div>
        <CardDescription>
          <data value={plan.priceMonthly} className="font-mono text-lg font-bold tabular-nums">
            {formatIDR(plan.priceMonthly)}
          </data>
          <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
            {" "}
            /bulan
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
          {Object.entries(plan.features ?? {}).map(([key, enabled]) => (
            <li key={key} className="flex items-center gap-2">
              {enabled ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Minus className="size-4" aria-hidden />
              )}
              {featureLabel(key)}
            </li>
          ))}
        </ul>
        {isCurrent ? (
          <p className="mt-auto border-2 border-ink bg-muted px-3 py-2 text-center font-mono text-xs font-bold uppercase tracking-[0.08em]">
            Paket kamu saat ini
          </p>
        ) : (
          trigger
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Copy per unit add-on — `session` menambah perangkat online, `storage`
 * menambah kuota penyimpanan, `feature` membuka fitur (mis. POS).
 * Sebelumnya semua kartu menulis copy sesi (salah untuk storage/POS).
 */
const ADD_ON_UNIT_COPY: Record<string, { detail: string; cta: string }> = {
  session: {
    detail: "+1 perangkat online / unit · atur jumlah di layar konfirmasi",
    cta: "Tambah sesi",
  },
  storage: {
    detail: "+1 paket storage / unit · atur jumlah di layar konfirmasi",
    cta: "Tambah storage",
  },
  feature: { detail: "Membuka fitur ini · aktif selama berlangganan", cta: "Aktifkan" },
};

const ADD_ON_COPY_FALLBACK = {
  detail: "+1 perangkat online / unit · atur jumlah di layar konfirmasi",
  cta: "Tambah",
};

function addOnCopy(unit: string) {
  return ADD_ON_UNIT_COPY[unit] ?? ADD_ON_COPY_FALLBACK;
}

function AddOnCardBlock({
  addOn,
  active,
  trigger,
  canWrite,
}: {
  addOn: AddOnCard;
  active: ActiveAddOn | null;
  trigger?: ReactNode;
  canWrite: boolean;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{addOn.name}</CardTitle>
          {active && (
            <span
              className={`rounded-none border-2 border-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] ${active.cancelAtPeriodEnd ? "bg-destructive text-destructive-foreground" : "bg-accent text-ink"}`}
            >
              ×{active.quantity} {active.cancelAtPeriodEnd ? "batal akhir periode" : "aktif"}
            </span>
          )}
        </div>
        <CardDescription>
          <data value={addOn.priceMonthly} className="font-mono text-base font-bold tabular-nums">
            {formatIDR(addOn.priceMonthly)}
          </data>
          <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
            {" "}
            /bulan
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
          {addOnCopy(addOn.unit).detail}
        </p>
        <div className="mt-auto flex flex-wrap items-start gap-2">
          {trigger}
          {active && !active.cancelAtPeriodEnd && canWrite && (
            <CancelAddOnButton addOnId={addOn.id} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SubscriptionPanel({
  subscription,
  usage,
  invoices,
  plans,
  addOns,
  canWrite,
}: Props) {
  const plan = subscription?.plan ?? null;
  const currentPlanCode = plan?.code ?? null;
  const activeAddOns = subscription?.addOns ?? [];
  // Hanya add-on extra_session yang menambah seat (docs/02 §2.9); POS/storage
  // tidak boleh menggelembungkan hint kuota sesi.
  const addOnSessions = activeAddOns
    .filter((a) => a.code === "extra_session")
    .reduce((sum, a) => sum + a.quantity, 0);
  const isCancelled = Boolean(subscription?.cancelAtPeriodEnd);
  const isExpired = subscription?.status === "expired";
  const isCancelledStatus =
    subscription?.status === "cancelled" || subscription?.status === "canceled";
  const canChangePlan = canWrite && !isCancelledStatus;
  const addOnTotal = activeAddOns.reduce((sum, a) => sum + a.priceMonthly * a.quantity, 0);
  const monthlyTotal = (plan?.priceMonthly ?? 0) + addOnTotal;

  return (
    <div className="flex flex-col gap-8">
      <section
        aria-labelledby="sub-status-heading"
        className="grid grid-cols-1 gap-6 lg:grid-cols-12"
      >
        <Card className="lg:col-span-7">
          <CardHeader>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {"Status langganan"}
            </p>
            <CardTitle id="sub-status-heading">{plan ? plan.name : "Belum berlangganan"}</CardTitle>
            <CardDescription>
              {subscription
                ? subscription.status === "trial"
                  ? `Trial sampai ${fmtDate(subscription.trialEndsAt)}${daysLeftLabel(subscription.trialEndsAt)}`
                  : subscription.status === "expired"
                    ? "Langganan kedaluwarsa: aktifkan kembali untuk memulihkan akses."
                    : `Periode berakhir ${fmtDate(subscription.currentPeriodEnd)}${daysLeftLabel(subscription.currentPeriodEnd)}`
                : "Business ini belum punya subscription aktif."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              Status: {subscriptionStatusLabel(subscription?.status)} ·{" "}
              {!subscription
                ? "tidak ada langganan"
                : isCancelledStatus
                  ? "dibatalkan, perlu aktivasi admin/support"
                  : isExpired
                    ? "kedaluwarsa, tidak diperpanjang otomatis"
                    : isCancelled
                      ? "berakhir di akhir periode"
                      : "berlanjut otomatis"}
            </p>

            {isCancelledStatus && (
              <div
                role="status"
                className="border-2 border-destructive bg-surface p-4 shadow-hard"
              >
                <p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-destructive">
                  Langganan dibatalkan
                </p>
                <p className="mt-2 max-w-[70ch] text-xs text-muted-foreground">
                  Langganan ini berstatus dibatalkan. Mengaktifkan kembali TIDAK bisa dilakukan
                  sendiri, hubungi admin/support untuk aktivasi manual (docs/02 §2.4). Paket dan
                  invoice tetap ditampilkan di bawah.
                </p>
              </div>
            )}

            {subscription && !isExpired && (
              <dl className="grid grid-cols-1 gap-[2px] border-2 border-ink bg-ink sm:grid-cols-3">
                <div className="flex flex-col gap-1 bg-surface p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    Tagihan /bulan
                  </dt>
                  <dd className="font-mono text-lg font-bold tabular-nums">
                    {formatIDR(monthlyTotal)}
                  </dd>
                </div>
                <div className="flex flex-col gap-1 bg-surface p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    Paket
                  </dt>
                  <dd className="font-mono text-lg font-bold tabular-nums">
                    {formatIDR(plan?.priceMonthly ?? 0)}
                  </dd>
                </div>
                <div className="flex flex-col gap-1 bg-surface p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    Add-on aktif
                  </dt>
                  <dd className="font-mono text-lg font-bold tabular-nums">
                    {formatIDR(addOnTotal)}
                  </dd>
                </div>
              </dl>
            )}

            {subscription && canWrite ? (
              isCancelledStatus ? null : isExpired ? (
                <SubscriptionCheckoutTrigger
                  plans={plans}
                  addOns={addOns}
                  currentPlanCode={currentPlanCode}
                  defaultPlanCode={plan?.code ?? plans[0]?.code ?? ""}
                  canWrite={canWrite}
                  recovery
                  className="w-fit"
                  label="Aktifkan Kembali"
                />
              ) : isCancelled ? (
                <ResumeSubscriptionForm />
              ) : (
                <CancelSubscriptionForm />
              )
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {"Pemakaian kuota"}
            </p>
            <CardTitle>Kuota</CardTitle>
            <CardDescription>Penggunaan saat ini vs batas plan kamu.</CardDescription>
          </CardHeader>
          <CardContent>
            <UsageRow label="Outlet" used={usage.outlets} max={plan?.maxOutlets ?? 0} />
            <UsageRow label="Photobox" used={usage.photoboxes} max={plan?.maxPhotoboxes ?? 0} />
            <UsageRow label="Staf" used={usage.staff} max={plan?.maxStaff ?? 0} />
            <UsageRow
              label="Perangkat online"
              used={usage.activeSessions}
              max={usage.maxConcurrentSessions}
              hint={
                addOnSessions > 0
                  ? `Plan ${plan?.maxConcurrentSessions ?? 0} + ${addOnSessions} add-on`
                  : undefined
              }
            />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="sub-plans-heading">
        <div className="mb-4 flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
          <h2 id="sub-plans-heading" className="font-display text-2xl uppercase tracking-tight">
            Paket
          </h2>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {"03. PILIH PAKET"}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <PlanCardBlock
              key={p.id}
              plan={p}
              isCurrent={plan?.code === p.code}
              trigger={
                <SubscriptionCheckoutTrigger
                  plans={plans}
                  addOns={addOns}
                  currentPlanCode={currentPlanCode}
                  defaultPlanCode={p.code}
                  canWrite={canChangePlan}
                  recovery={isExpired}
                  className="mt-auto w-full"
                  label={p.priceMonthly > 0 ? "Pilih & atur add-on" : "Turunkan plan"}
                />
              }
            />
          ))}
        </div>
        {!canWrite && (
          <p className="mt-4 text-xs text-muted-foreground">
            Hanya owner yang dapat mengubah paket.
          </p>
        )}
        {isCancelledStatus && (
          <p className="mt-4 text-xs text-muted-foreground">
            Perubahan paket/add-on dinonaktifkan selama langganan berstatus dibatalkan. Hubungi
            admin/support.
          </p>
        )}
        {canWrite && (
          <p className="mt-4 text-xs text-muted-foreground">
            Pilih paket → atur add-on & voucher di layar konfirmasi → harga fix → bayar.
          </p>
        )}
      </section>

      <section aria-labelledby="sub-addons-heading">
        <div className="mb-4 flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
          <h2 id="sub-addons-heading" className="font-display text-2xl uppercase tracking-tight">
            Add-on
          </h2>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {"04. ADD-ON: SESI, PENYIMPANAN, FITUR"}
          </span>
        </div>
        {addOns.length === 0 ? (
          <div className="flex flex-col items-center gap-2 border-2 border-dashed border-ink/40 bg-muted p-8 text-center text-muted-foreground">
            <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              Belum ada add-on tersedia.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {addOns.map((a) => (
              <AddOnCardBlock
                key={a.id}
                addOn={a}
                active={activeAddOns.find((x) => x.addOnId === a.id) ?? null}
                canWrite={canChangePlan}
                trigger={
                  <SubscriptionCheckoutTrigger
                    plans={plans}
                    addOns={addOns}
                    currentPlanCode={currentPlanCode}
                    defaultPlanCode={plan?.code ?? plans[0]?.code ?? ""}
                    defaultAddOnId={a.id}
                    canWrite={canChangePlan}
                    recovery={isExpired}
                    size="sm"
                    label={
                      <>
                        <Plus className="size-4" aria-hidden /> {addOnCopy(a.unit).cta}
                      </>
                    }
                  />
                }
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="sub-invoices-heading">
        <div className="mb-4 flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
          <h2 id="sub-invoices-heading" className="font-display text-2xl uppercase tracking-tight">
            Invoice
          </h2>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {"05. TAGIHAN: BAYAR VIA QRIS"}
          </span>
        </div>
        <p className="mb-4 max-w-[70ch] text-xs text-muted-foreground">
          Pilih paket / beli add-on → invoice pending terbit → bayar di halaman pembayaran (berbatas
          waktu) → plan & add-on aktif otomatis. Invoice lunas bisa diunduh buktinya.
        </p>
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 border-2 border-dashed border-ink/40 bg-muted p-8 text-center text-muted-foreground">
            <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              Belum ada invoice: invoice terbit saat plan diubah / add-on dibeli.
            </p>
          </div>
        ) : (
          <RecordCollection
            storageKey="snapyos.view.invoices"
            label="Riwayat invoice"
            list={
              <Table>
                <TableCaption className="sr-only">Riwayat invoice subscription</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Nomor</TableHead>
                    <TableHead scope="col" className="hidden md:table-cell">
                      Item
                    </TableHead>
                    <TableHead scope="col">Jumlah</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col" className="hidden lg:table-cell">
                      Dibayar
                    </TableHead>
                    <TableHead scope="col">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="tabular-nums">{inv.number}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {inv.intent?.name ?? "-"}
                      </TableCell>
                      <TableCell className="tabular-nums">{formatIDR(inv.amount)}</TableCell>
                      <TableCell className="font-mono text-[11px] uppercase tracking-[0.05em]">
                        {invoiceStatusLabel(inv.status)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">{fmtDate(inv.paidAt)}</TableCell>
                      <TableCell>
                        {inv.status === "pending" ? (
                          <IconLink
                            href={`/dashboard/subscription/invoice/${inv.id}`}
                            label={`Bayar invoice ${inv.number}`}
                            variant="default"
                            compact
                          >
                            <QrCode className="size-4" aria-hidden="true" />
                          </IconLink>
                        ) : inv.status === "paid" ? (
                          <IconLink
                            href={`/dashboard/subscription/invoice/${inv.id}/receipt?download=1`}
                            label={`Unduh bukti invoice ${inv.number}`}
                            compact
                            download={`${inv.number}.pdf`}
                          >
                            <Download className="size-4" aria-hidden="true" />
                          </IconLink>
                        ) : (
                          <span className="text-muted-foreground">Dibatalkan</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            }
            grid={
              <ul
                className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
                aria-label="Invoice (tampilan kotak)"
              >
                {invoices.map((inv) => (
                  <li key={inv.id} className="min-w-0">
                    <RecordCard
                      title={inv.number}
                      subtitle={inv.intent?.name ?? "-"}
                      badge={
                        <StatusBadge status={inv.status} label={invoiceStatusLabel(inv.status)} />
                      }
                      meta={[
                        { label: "Jumlah", value: formatIDR(inv.amount) },
                        { label: "Dibayar", value: fmtDate(inv.paidAt) },
                      ]}
                      actions={
                        inv.status === "pending" ? (
                          <IconLink
                            href={`/dashboard/subscription/invoice/${inv.id}`}
                            label={`Bayar invoice ${inv.number}`}
                            variant="default"
                            compact
                          >
                            <QrCode className="size-4" aria-hidden="true" />
                          </IconLink>
                        ) : inv.status === "paid" ? (
                          <IconLink
                            href={`/dashboard/subscription/invoice/${inv.id}/receipt?download=1`}
                            label={`Unduh bukti invoice ${inv.number}`}
                            compact
                            download={`${inv.number}.pdf`}
                          >
                            <Download className="size-4" aria-hidden="true" />
                          </IconLink>
                        ) : (
                          <span className="font-mono text-[10px] uppercase text-muted-foreground">
                            Dibatalkan
                          </span>
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            }
          />
        )}
      </section>
    </div>
  );
}
