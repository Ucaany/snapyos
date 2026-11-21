import Link from "next/link";
import { AlertOctagon, CheckCircle2, Clock, Filter, Receipt } from "lucide-react";

import { AdminActionButton, AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminFilterForm } from "@/components/admin/AdminFilterForm";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { AdminSectionHeading } from "@/components/admin/AdminSectionHeading";
import { AdminStatGrid } from "@/components/admin/AdminStatGrid";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Button, buttonVariants } from "@/components/admin/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import { Input } from "@/components/admin/ui/input";
import {
  attachAddOnAction,
  cancelAddOnAction,
  updateSubscriptionAction,
} from "@/server/admin-actions";
import {
  getSubscriptionStats,
  listAddOns,
  listIntentFailures,
  listSubscriptions,
} from "@/server/admin";
import { Label } from "@/components/admin/ui/label";

/**
 * Admin subscriptions - list, ubah status, perpanjang, cancel, kelola add-on
 * aktif (docs/10 §10.2).
 */

const STATUSES = ["trial", "active", "past_due", "cancelled", "expired"] as const;

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const q = await searchParams;
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const [{ items, total }, addOns, stats, review] = await Promise.all([
    listSubscriptions({ status: q.status, page, limit: 20 }),
    listAddOns(),
    getSubscriptionStats(),
    listIntentFailures({ status: "pending", page: 1, limit: 1 }),
  ]);

  const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const activeAddOns = addOns.filter((a) => a.is_active);
  const pendingReview = review.countsByStatus.pending ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={Receipt}
        title="Manajemen Langganan"
        meta={`${total} langganan${q.status ? ` · filter: ${q.status}` : ""}`}
      />

      <section aria-labelledby="admin-subscriptions-metrics" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-subscriptions-metrics"
          title="Ikhtisar"
          description="Status seluruh langganan tenant SnapyOS."
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            accent
            tone="emerald"
            icon={CheckCircle2}
            label="Efektif aktif"
            value={String(stats.effectiveActive)}
            sub={`${stats.statusCounts.trial ?? 0} trial berjalan`}
          />
          <AdminMetricCard
            tone="neutral"
            icon={Receipt}
            label="Total langganan"
            value={String(stats.total)}
            sub="Seluruh status"
          />
          <AdminMetricCard
            tone="amber"
            icon={Clock}
            label="Lewat tempo"
            value={String(stats.pastDue)}
            sub="Menunggu pembayaran"
          />
          <AdminMetricCard
            tone="amber"
            icon={AlertOctagon}
            label="Review aktivasi"
            value={String(pendingReview)}
            sub="Butuh keputusan manual"
          />
        </div>
      </section>

      <section aria-labelledby="admin-subscriptions-list" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-subscriptions-list"
          title="Daftar langganan"
          description={`${total} langganan${q.status ? ` · filter ${q.status}` : ""}.`}
          action={
            <AdminFilterForm
              action="/admin/subscriptions"
              className="flex flex-wrap items-end gap-2"
            >
              <AdminSelect
                name="status"
                label="Status"
                defaultValue={q.status ?? ""}
                options={[
                  { value: "", label: "SEMUA" },
                  ...STATUSES.map((s) => ({ value: s, label: s.toUpperCase() })),
                ]}
              />
              <Button type="submit" size="sm" variant="outline">
                <Filter className="size-4" aria-hidden="true" />
                Terapkan
              </Button>
            </AdminFilterForm>
          }
        />

        {items.length === 0 ? (
          <AdminEmptyState
            heading="Tidak ada langganan"
            icon={Receipt}
            action={
              q.status ? (
                <Link
                  href="/admin/subscriptions"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Hapus filter
                </Link>
              ) : null
            }
          >
            Tidak ada langganan{q.status ? ` berstatus ${q.status}` : ""} saat ini.
          </AdminEmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {items.map((s) => (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle>{s.business_name}</CardTitle>
                  <CardDescription>
                    PLAN {s.plan_name} ({s.plan_code.toUpperCase()}) ·{" "}
                    {s.current_period_end
                      ? `s/d ${dateFmt.format(new Date(s.current_period_end))}`
                      : "tanpa periode"}
                    {s.cancel_at_period_end ? " · BATAL DI AKHIR PERIODE" : ""}
                  </CardDescription>
                  <CardAction>
                    <AdminStatusBadge status={s.status} />
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <AdminStatGrid
                    items={[
                      {
                        label: "Periode mulai",
                        value: s.current_period_start
                          ? dateFmt.format(new Date(s.current_period_start))
                          : "-",
                      },
                      {
                        label: "Periode selesai",
                        value: s.current_period_end
                          ? dateFmt.format(new Date(s.current_period_end))
                          : "-",
                      },
                      {
                        label: "Trial s/d",
                        value: s.trial_ends_at ? dateFmt.format(new Date(s.trial_ends_at)) : "-",
                      },
                      {
                        label: "Invoice terakhir",
                        value: s.last_invoice
                          ? `${s.last_invoice.number} · ${s.last_invoice.status.toUpperCase()}`
                          : "-",
                      },
                    ]}
                  />

                  {s.add_ons.length > 0 ? (
                    <ul className="flex flex-col gap-3">
                      {s.add_ons.map((link) => (
                        <li
                          key={link.id}
                          className="flex flex-col gap-2 border-t pt-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                        >
                          <span className="min-w-0 break-words">
                            + {link.name} × {link.quantity}
                          </span>
                          <AdminActionForm
                            action={cancelAddOnAction}
                            hidden={{ linkId: link.id }}
                            submitLabel="Batalkan add-on"
                            icon="xCircle"
                            variant="neutral"
                            confirm={`Batalkan add-on ${link.name} untuk ${s.business_name}? Mode SEGERA memutus fitur pelanggan seketika.`}
                            className="flex w-full flex-wrap items-end gap-2 sm:w-auto"
                          >
                            <AdminSelect
                              id={`cancel-mode-${link.id}`}
                              name="mode"
                              label="Mode batal"
                              defaultValue="deferred"
                              options={[
                                { value: "deferred", label: "AKHIR PERIODE" },
                                { value: "immediate", label: "SEGERA (AUDIT)" },
                              ]}
                            />
                            <div className="flex flex-col gap-1">
                              <Label
                                htmlFor={`cancel-reason-${link.id}`}
                                className="text-xs font-medium text-muted-foreground"
                              >
                                Alasan (wajib bila SEGERA)
                              </Label>
                              <Input
                                id={`cancel-reason-${link.id}`}
                                name="manual_cancel_reason"
                                placeholder="Darurat/fraud"
                                className="w-full text-xs sm:w-36"
                              />
                            </div>
                          </AdminActionForm>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
                    <AdminActionForm
                      action={updateSubscriptionAction}
                      hidden={{ subscriptionId: s.id }}
                      submitLabel="Terapkan status langganan"
                      icon="check"
                      className="flex w-full flex-wrap items-end gap-2 sm:w-auto"
                    >
                      <AdminSelect
                        id={`status-${s.id}`}
                        name="status"
                        label="Ubah status"
                        defaultValue={s.status}
                        options={STATUSES.map((st) => ({ value: st, label: st.toUpperCase() }))}
                      />
                      <div className="flex flex-col gap-1">
                        <Label
                          htmlFor={`extend-${s.id}`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Perpanjang (hari)
                        </Label>
                        <Input
                          id={`extend-${s.id}`}
                          name="extend_days"
                          type="number"
                          placeholder="30"
                          className="w-full text-xs sm:w-28"
                        />
                      </div>
                    </AdminActionForm>

                    {!s.cancel_at_period_end ? (
                      <AdminActionButton
                        action={updateSubscriptionAction}
                        hidden={{ subscriptionId: s.id, cancel: "true" }}
                        submitLabel="Batalkan di akhir periode"
                        icon="xCircle"
                        variant="neutral"
                        confirm={`Jadwalkan pembatalan ${s.business_name} di akhir periode berjalan? Fitur tetap aktif sampai periode selesai.`}
                        confirmTitle="Batalkan di akhir periode"
                      />
                    ) : null}

                    {activeAddOns.length > 0 ? (
                      <AdminActionForm
                        action={attachAddOnAction}
                        hidden={{ subscription_id: s.id }}
                        submitLabel="Set jumlah"
                        icon="plus"
                        className="flex w-full flex-wrap items-end gap-2 sm:w-auto"
                      >
                        <AdminSelect
                          id={`addon-${s.id}`}
                          name="add_on_id"
                          label="Add-on"
                          options={(() => {
                            const cancelled = new Set(s.cancelled_add_on_ids);
                            return activeAddOns.map((a) => ({
                              value: a.id,
                              label: cancelled.has(a.id) ? `+ ${a.name} · REAKTIVASI` : a.name,
                            }));
                          })()}
                        />
                        <div className="flex flex-col gap-1">
                          <Label
                            htmlFor={`qty-${s.id}`}
                            className="text-xs font-medium text-muted-foreground"
                          >
                            Jumlah
                          </Label>
                          <Input
                            id={`qty-${s.id}`}
                            name="quantity"
                            type="number"
                            defaultValue={1}
                            min={1}
                            className="w-full text-xs sm:w-20"
                          />
                        </div>
                        <p className="w-full max-w-[42ch] text-xs text-muted-foreground">
                          Angka ini mengatur jumlah unit add-on (bukan menambah). Isi angka lebih
                          rendah dari jumlah aktif untuk mengurangi.
                        </p>
                      </AdminActionForm>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <AdminPaginator
          basePath="/admin/subscriptions"
          page={page}
          totalPages={totalPages}
          searchParams={{ status: q.status }}
        />
      </section>
    </div>
  );
}
