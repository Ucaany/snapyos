import Link from "next/link";
import { Receipt } from "lucide-react";

import { AdminActionButton, AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  attachAddOnAction,
  cancelAddOnAction,
  updateSubscriptionAction,
} from "@/server/admin-actions";
import { listAddOns, listSubscriptions } from "@/server/admin";

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
  const [{ items, total }, addOns] = await Promise.all([
    listSubscriptions({ status: q.status, page, limit: 20 }),
    listAddOns(),
  ]);

  const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const activeAddOns = addOns.filter((a) => a.is_active);

  return (
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <PageHeader
        eyebrow="ADMIN / LANGGANAN"
        icon={Receipt}
        title="Manajemen Langganan"
        meta={`${total} langganan${q.status ? ` · filter: ${q.status}` : ""}`}
        right={
          <form method="GET" className="flex flex-wrap items-end gap-2">
            <BrutalistSelect
              name="status"
              label="Status"
              defaultValue={q.status ?? ""}
              options={[
                { value: "", label: "SEMUA" },
                ...STATUSES.map((s) => ({ value: s, label: s.toUpperCase() })),
              ]}
            />
            <Button type="submit" size="sm" variant="secondary">
              Filter
            </Button>
          </form>
        }
      />

      {items.length === 0 ? (
        <AdminEmptyState
          heading="TIDAK ADA LANGGANAN"
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
            <div
              key={s.id}
              className="border-2 border-ink bg-surface p-4 shadow-hard"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <span className="block font-display text-lg uppercase tracking-tight">
                    {s.business_name}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    PLAN {s.plan_name} ({s.plan_code.toUpperCase()}) ·{" "}
                    {s.current_period_end
                      ? `s/d ${dateFmt.format(new Date(s.current_period_end))}`
                      : "tanpa periode"}
                    {s.cancel_at_period_end ? " · BATAL DI AKHIR PERIODE" : ""}
                  </span>
                </span>
                <StatusBadge status={s.status} />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-[2px] border-2 border-ink bg-ink md:grid-cols-4">
                {[
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
                ].map((cell) => (
                  <div key={cell.label} className="flex flex-col gap-1 bg-surface p-3">
                    <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      {cell.label}
                    </dt>
                    <dd className="font-mono text-xs font-bold uppercase">{cell.value}</dd>
                  </div>
                ))}
              </dl>

              {s.add_ons.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {s.add_ons.map((link) => (
                    <li
                      key={link.id}
                      className="flex flex-col gap-2 border-2 border-ink/40 bg-muted px-3 py-2 font-mono text-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="min-w-0 break-words uppercase">
                        + {link.name} × {link.quantity}
                      </span>
                      <AdminActionForm
                        action={cancelAddOnAction}
                        hidden={{ linkId: link.id }}
                        submitLabel="Batalkan add-on"
                        icon="xCircle"
                        variant="outline"
                        confirm={`Batalkan add-on ${link.name} untuk ${s.business_name}? Mode SEGERA memutus fitur pelanggan seketika.`}
                        className="flex w-full flex-wrap items-end gap-2 sm:w-auto"
                      >
                        <BrutalistSelect
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
                          <label
                            htmlFor={`cancel-reason-${link.id}`}
                            className="font-mono text-[11px] uppercase tracking-[0.12em]"
                          >
                            Alasan (wajib bila SEGERA)
                          </label>
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

              <div className="mt-4 flex flex-col gap-2 border-t-2 border-ink/10 pt-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
                <AdminActionForm
                  action={updateSubscriptionAction}
                  hidden={{ subscriptionId: s.id }}
                  submitLabel="Terapkan status langganan"
                  icon="check"
                  className="flex w-full flex-wrap items-end gap-2 sm:w-auto"
                >
                  <BrutalistSelect
                    id={`status-${s.id}`}
                    name="status"
                    label="Ubah status"
                    defaultValue={s.status}
                    options={STATUSES.map((st) => ({ value: st, label: st.toUpperCase() }))}
                  />
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`extend-${s.id}`}
                      className="font-mono text-[11px] uppercase tracking-[0.12em]"
                    >
                      Perpanjang (hari)
                    </label>
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
                    variant="outline"
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
                    <BrutalistSelect
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
                      <label
                        htmlFor={`qty-${s.id}`}
                        className="font-mono text-[11px] uppercase tracking-[0.12em]"
                      >
                        Jumlah
                      </label>
                      <Input
                        id={`qty-${s.id}`}
                        name="quantity"
                        type="number"
                        defaultValue={1}
                        min={1}
                        className="w-full text-xs sm:w-20"
                      />
                    </div>
                    <p className="w-full max-w-[42ch] font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                      Angka ini mengatur jumlah unit add-on (bukan menambah). Isi angka lebih rendah
                      dari jumlah aktif untuk mengurangi.
                    </p>
                  </AdminActionForm>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminPaginator
        basePath="/admin/subscriptions"
        page={page}
        totalPages={totalPages}
        searchParams={{ status: q.status }}
      />
    </div>
  );
}
