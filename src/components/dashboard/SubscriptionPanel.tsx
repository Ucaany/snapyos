import Link from "next/link";
import type { ReactNode } from "react";
import { Check, Download, Minus, Plus, QrCode, X } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { SubscriptionCheckoutTrigger } from "@/components/dashboard/SubscriptionCheckoutTrigger";
import { formatIDR } from "@/lib/dashboard-math";
import { usagePercent } from "@/lib/subscription-math";
import type {
  ActiveAddOn,
  AddOnCard,
  InvoiceRow,
  PlanCard,
  SubscriptionOverview,
} from "@/server/subscription";
import {
  cancelAddOnAction,
  cancelSubscriptionAction,
  resumeSubscriptionAction,
} from "@/server/subscription-actions";

type Props = {
  subscription: SubscriptionOverview["subscription"];
  usage: SubscriptionOverview["usage"];
  invoices: InvoiceRow[];
  plans: PlanCard[];
  addOns: AddOnCard[];
  canWrite: boolean;
};

const PLAN_FEATURES: { key: string; label: string }[] = [
  { key: "direct_payment", label: "Payment gateway direct-merchant" },
  { key: "staff", label: "Staff management" },
  { key: "finance", label: "Finance / settlement" },
  { key: "storage", label: "Storage" },
  { key: "reports", label: "Laporan / reports" },
  { key: "voucher", label: "Voucher" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function UsageRow({ label, used, max, hint }: { label: string; used: number; max: number; hint?: string }) {
  const pct = usagePercent(used, max);
  return (
    <div className="flex flex-col gap-1 border-b-2 border-ink/10 py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">{label}</span>
        <span className="font-mono text-xs font-bold tabular-nums">
          {used} / {max}
        </span>
      </div>
      <div
        className="h-2 w-full rounded-none border-2 border-ink bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={used}
        aria-label={`Pemakaian ${label}`}
      >
        <div
          className={`h-full rounded-none ${pct >= 100 ? "bg-destructive" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint && (
        <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">{hint}</p>
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
    <Card
      className={`h-full ${isCurrent ? "bg-accent" : ""}`}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{plan.name}</CardTitle>
          {isCurrent && (
            <span className="border-2 border-ink bg-ink px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-bg">
              Plan kamu
            </span>
          )}
        </div>
        <CardDescription>
          <data value={plan.priceMonthly} className="font-mono text-lg font-bold tabular-nums">
            {formatIDR(plan.priceMonthly)}
          </data>
          <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground"> /bulan</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
          <li className="flex items-center gap-2">
            <Check className="size-4" aria-hidden /> 1 outlet, 1 photobox, 1 perangkat online
          </li>
          {PLAN_FEATURES.map(({ key, label }) => (
            <li key={key} className="flex items-center gap-2">
              {plan.features?.[key] ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Minus className="size-4" aria-hidden />
              )}
              {label}
            </li>
          ))}
        </ul>
        {isCurrent ? (
          <Button type="button" variant="outline" disabled className="mt-auto w-full">
            Plan kamu saat ini
          </Button>
        ) : (
          trigger
        )}
      </CardContent>
    </Card>
  );
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
            <span className={`rounded-none border-2 border-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-ink ${active.cancelAtPeriodEnd ? "bg-destructive/20" : "bg-accent"}`}>
              ×{active.quantity} {active.cancelAtPeriodEnd ? "batal akhir periode" : "aktif"}
            </span>
          )}
        </div>
        <CardDescription>
          <data value={addOn.priceMonthly} className="font-mono text-base font-bold tabular-nums">
            {formatIDR(addOn.priceMonthly)}
          </data>
          <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground"> /bulan</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
          +1 perangkat online / unit · atur jumlah di layar konfirmasi
        </p>
        <div className="mt-auto flex flex-wrap gap-2">
          {trigger}
          {active && !active.cancelAtPeriodEnd && (
            <Button
              type="submit"
              form="cancel-add-on"
              name="add_on_id"
              value={addOn.id}
              variant="outline"
              size="sm"
              disabled={!canWrite}
            >
              <Minus className="size-4" aria-hidden /> Batalkan
            </Button>
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
  const addOnSessions = activeAddOns.reduce((sum, a) => sum + a.quantity, 0);
  const isCancelled = Boolean(subscription?.cancelAtPeriodEnd);
  const isExpired = subscription?.status === "expired";
  const addOnTotal = activeAddOns.reduce((sum, a) => sum + a.priceMonthly * a.quantity, 0);
  const monthlyTotal = (plan?.priceMonthly ?? 0) + addOnTotal;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="sub-status-heading" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              {"Status langganan"}
            </p>
            <CardTitle id="sub-status-heading">
              {plan ? plan.name : "Belum berlangganan"}
            </CardTitle>
            <CardDescription>
              {subscription
                ? subscription.status === "trial"
                  ? `Trial sampai ${fmtDate(subscription.trialEndsAt)}`
                  : subscription.status === "expired"
                    ? "Langganan kedaluwarsa — aktifkan kembali untuk memulihkan akses."
                    : `Periode berakhir ${fmtDate(subscription.currentPeriodEnd)}`
                : "Business ini belum punya subscription aktif."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              Status: {subscription?.status ?? "—"} ·{" "}
              {isCancelled ? "berakhir di akhir periode" : "berlanjut otomatis"}
            </p>

            {subscription && !isExpired && (
              <dl className="grid grid-cols-1 gap-[2px] border-2 border-ink bg-ink sm:grid-cols-3">
                <div className="flex flex-col gap-1 bg-surface p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    Tagihan /bulan
                  </dt>
                  <dd className="font-mono text-lg font-bold tabular-nums">{formatIDR(monthlyTotal)}</dd>
                </div>
                <div className="flex flex-col gap-1 bg-surface p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    Plan
                  </dt>
                  <dd className="font-mono text-lg font-bold tabular-nums">{formatIDR(plan?.priceMonthly ?? 0)}</dd>
                </div>
                <div className="flex flex-col gap-1 bg-surface p-3">
                  <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    Add-on aktif
                  </dt>
                  <dd className="font-mono text-lg font-bold tabular-nums">{formatIDR(addOnTotal)}</dd>
                </div>
              </dl>
            )}

            {subscription && canWrite ? (
              isExpired ? (
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
                <form action={resumeSubscriptionAction}>
                  <Button type="submit">
                    Lanjutkan langganan
                  </Button>
                </form>
              ) : (
                <form action={cancelSubscriptionAction}>
                  <Button type="submit" variant="destructive">
                    <X className="size-4" aria-hidden /> Batalkan di akhir periode
                  </Button>
                </form>
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
          <h2
            id="sub-plans-heading"
            className="font-display text-2xl uppercase tracking-tight"
          >
            Plans
          </h2>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {"/// 03. PILIH PLAN"}
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
                  canWrite={canWrite}
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
            Hanya owner yang dapat mengubah plan.
          </p>
        )}
        {canWrite && (
          <p className="mt-4 text-xs text-muted-foreground">
            Pilih plan → atur add-on & voucher di layar konfirmasi → harga fix → bayar.
          </p>
        )}
      </section>

      <section aria-labelledby="sub-addons-heading">
        <div className="mb-4 flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
          <h2
            id="sub-addons-heading"
            className="font-display text-2xl uppercase tracking-tight"
          >
            Add-ons
          </h2>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {"/// 04. TAMBAH SESI BERSAMAAN"}
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
                canWrite={canWrite}
                trigger={
                  <SubscriptionCheckoutTrigger
                    plans={plans}
                    addOns={addOns}
                    currentPlanCode={currentPlanCode}
                    defaultPlanCode={plan?.code ?? plans[0]?.code ?? ""}
                    defaultAddOnId={a.id}
                    canWrite={canWrite}
                    recovery={isExpired}
                    size="sm"
                    label={
                      <>
                        <Plus className="size-4" aria-hidden /> Tambah sesi
                      </>
                    }
                  />
                }
              />
            ))}
          </div>
        )}
        {/* Host form tombol "Batalkan" (button form="cancel-add-on") — tidak
            bisa nested di dalam form pembelian. */}
        {addOns.length > 0 && (
          <form id="cancel-add-on" action={cancelAddOnAction} className="sr-only" />
        )}
      </section>

      <section aria-labelledby="sub-invoices-heading">
        <div className="mb-4 flex items-end justify-between gap-4 border-b-2 border-ink pb-3">
          <h2
            id="sub-invoices-heading"
            className="font-display text-2xl uppercase tracking-tight"
          >
            Invoice
          </h2>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {"/// 05. TAGIHAN — BAYAR VIA QRIS"}
          </span>
        </div>
        <p className="mb-4 max-w-[70ch] text-xs text-muted-foreground">
          Pilih plan / beli add-on → invoice pending terbit → bayar di halaman
          pembayaran (berbatas waktu) → plan & add-on aktif otomatis. Invoice lunas
          bisa diunduh buktinya.
        </p>
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-2 border-2 border-dashed border-ink/40 bg-muted p-8 text-center text-muted-foreground">
            <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              Belum ada invoice — invoice terbit saat plan diubah / add-on dibeli.
            </p>
          </div>
        ) : (
            <Table>
              <TableCaption className="sr-only">Riwayat invoice subscription</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Nomor</TableHead>
                  <TableHead scope="col">Item</TableHead>
                  <TableHead scope="col">Jumlah</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col">Dibayar</TableHead>
                  <TableHead scope="col">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="tabular-nums">{inv.number}</TableCell>
                    <TableCell>{inv.intent?.name ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{formatIDR(inv.amount)}</TableCell>
                    <TableCell>{inv.status}</TableCell>
                    <TableCell>{fmtDate(inv.paidAt)}</TableCell>
                    <TableCell>
                      {inv.status === "pending" || inv.status === "void" ? (
                        inv.status === "pending" ? (
                          <Link
                            href={`/dashboard/subscription/invoice/${inv.id}`}
                            className="inline-flex items-center gap-1.5 rounded-none border-2 border-ink bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.05em] text-ink shadow-[2px_2px_0_#111] hover:bg-accent/80"
                          >
                            <QrCode className="size-4" aria-hidden /> Bayar
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Dibatalkan</span>
                        )
                      ) : inv.status === "paid" ? (
                        <a
                          href={`/dashboard/subscription/invoice/${inv.id}/receipt?download=1`}
                          download={`${inv.number}.pdf`}
                          className="inline-flex items-center gap-1.5 rounded-none border-2 border-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.05em] hover:bg-muted"
                        >
                          <Download className="size-4" aria-hidden /> Bukti
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        )}
      </section>
    </div>
  );
}
