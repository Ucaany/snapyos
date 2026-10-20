import { AdminActionButton, AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
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
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {"/// ADMIN - SUBSCRIPTIONS"}
          </p>
          <h1 className="mt-2 font-display text-3xl uppercase tracking-tight md:text-4xl">
            Manajemen Subscription
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {total} subscription{q.status ? ` · filter: ${q.status}` : ""}
          </p>
        </div>
        <form method="GET" className="flex items-end gap-2">
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
      </header>

      {items.length === 0 ? (
        <AdminEmptyState heading="/// TIDAK ADA SUBSCRIPTION">
          Tidak ada subscription{q.status ? ` berstatus ${q.status}` : ""} saat ini.
        </AdminEmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((s) => (
            <div
              key={s.id}
              className="border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_#111111]"
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
                    {s.cancel_at_period_end ? " · CANCEL AT PERIOD END" : ""}
                  </span>
                </span>
                <StatusBadge status={s.status} />
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-[2px] border-2 border-ink/20 bg-ink/20 md:grid-cols-4">
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
                    <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
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
                      className="flex flex-wrap items-center justify-between gap-3 border-2 border-ink/20 bg-muted/60 px-3 py-2 font-mono text-xs"
                    >
                      <span className="min-w-0 break-words uppercase">
                        + {link.name} × {link.quantity}
                      </span>
                      <AdminActionForm
                        action={cancelAddOnAction}
                        hidden={{ linkId: link.id }}
                        submitLabel="Batalkan"
                        variant="outline"
                        confirm="Batalkan add-on ini? Mode SEGERA memutus fitur pelanggan seketika."
                        className="flex flex-wrap items-end gap-2"
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
                          className="h-9"
                        />
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor={`cancel-reason-${link.id}`}
                            className="font-mono text-[10px] uppercase tracking-[0.12em]"
                          >
                            Alasan (wajib bila SEGERA)
                          </label>
                          <Input
                            id={`cancel-reason-${link.id}`}
                            name="manual_cancel_reason"
                            placeholder="Darurat/fraud"
                            className="h-9 w-36 text-xs"
                          />
                        </div>
                      </AdminActionForm>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-4 flex flex-wrap items-end gap-4 border-t-2 border-ink/10 pt-4">
                <AdminActionForm
                  action={updateSubscriptionAction}
                  hidden={{ subscriptionId: s.id }}
                  submitLabel="Terapkan"
                  className="flex flex-wrap items-end gap-2"
                >
                  <BrutalistSelect
                    id={`status-${s.id}`}
                    name="status"
                    label="Ubah status"
                    defaultValue={s.status}
                    options={STATUSES.map((st) => ({ value: st, label: st.toUpperCase() }))}
                    className="h-9"
                  />
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`extend-${s.id}`}
                      className="font-mono text-[10px] uppercase tracking-[0.12em]"
                    >
                      Perpanjang (hari)
                    </label>
                    <Input
                      id={`extend-${s.id}`}
                      name="extend_days"
                      type="number"
                      placeholder="30"
                      className="h-9 w-28 text-xs"
                    />
                  </div>
                </AdminActionForm>

                {!s.cancel_at_period_end ? (
                  <AdminActionButton
                    action={updateSubscriptionAction}
                    hidden={{ subscriptionId: s.id, cancel: "true" }}
                    submitLabel="Cancel di Akhir Periode"
                    variant="outline"
                  />
                ) : null}

                {activeAddOns.length > 0 ? (
                  <AdminActionForm
                    action={attachAddOnAction}
                    hidden={{ subscription_id: s.id }}
                    submitLabel="Tambah Add-on"
                    className="flex flex-wrap items-end gap-2"
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
                      className="h-9"
                    />
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`qty-${s.id}`}
                        className="font-mono text-[10px] uppercase tracking-[0.12em]"
                      >
                        Qty
                      </label>
                      <Input
                        id={`qty-${s.id}`}
                        name="quantity"
                        type="number"
                        defaultValue={1}
                        min={1}
                        className="h-9 w-20 text-xs"
                      />
                    </div>
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
