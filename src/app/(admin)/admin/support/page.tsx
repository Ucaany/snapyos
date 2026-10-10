import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { updateSupportTicketStatusAction } from "@/server/admin-actions";
import { listSupportTicketsAdmin } from "@/server/admin";
import { STATUS_LABEL } from "@/lib/support-ticket-constants";

/**
 * Admin support tickets - docs/10 §10.6: tiket lintas tenant + ubah status
 * (open / needs_action / resolved). Semua aksi ter-audit + guarded requireAdmin.
 */

const STATUS_OPTIONS = [
  { value: "open", label: "TERBUKA" },
  { value: "needs_action", label: "BUTUH TINDAKAN" },
  { value: "resolved", label: "SELESAI" },
] as const;

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const q = await searchParams;
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const { items, total } = await listSupportTicketsAdmin({ status: q.status, page, limit: 20 });

  const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {"/// ADMIN - SUPPORT TICKETS"}
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-tight md:text-4xl">
          Tiket Bantuan
        </h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          SEMUA TENANT · {total} TIKET COCOK FILTER
        </p>
      </header>

      <form method="GET" className="flex flex-wrap items-end gap-3" role="search">
        <BrutalistSelect
          name="status"
          label="Status"
          defaultValue={q.status ?? ""}
          options={[
            { value: "", label: "SEMUA" },
            ...STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label })),
          ]}
        />
        <button
          type="submit"
          className="h-11 border-2 border-ink bg-surface px-4 font-mono text-xs font-bold uppercase tracking-[0.1em] shadow-[2px_2px_0_0_#111111] active:translate-y-[2px]"
        >
          Filter tiket
        </button>
      </form>

      {items.length === 0 ? (
        <AdminEmptyState heading="/// TIDAK ADA TIKET">
          Belum ada tiket yang cocok dengan filter saat ini.
        </AdminEmptyState>
      ) : (
        <div className="overflow-x-auto border-2 border-ink shadow-[4px_4px_0_0_#111111]">
          <table className="w-full min-w-[960px] border-collapse bg-surface text-left">
            <thead>
              <tr className="bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                <th className="px-4 py-3 font-bold">Subjek</th>
                <th className="px-4 py-3 font-bold">Bisnis</th>
                <th className="px-4 py-3 font-bold">Kategori · Area</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Waktu</th>
                <th className="px-4 py-3 font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-t-2 border-ink/10">
                  <td className="max-w-[280px] px-4 py-3 text-sm font-semibold">
                    {t.subject}
                  </td>
                  <td className="px-4 py-3 text-sm">{t.business_name}</td>
                  <td className="px-4 py-3 font-mono text-[10px] uppercase text-muted-foreground">
                    {t.category} · {t.area}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {dateFmt.format(new Date(t.created_at))}
                  </td>
                  <td className="px-4 py-3">
                    <AdminActionForm
                      action={updateSupportTicketStatusAction}
                      hidden={{ ticketId: t.id }}
                      submitLabel={`→ ${STATUS_LABEL[t.status === "open" ? "needs_action" : t.status === "needs_action" ? "resolved" : "open"]}`}
                      className="flex items-center gap-2"
                    >
                      <select
                        name="status"
                        defaultValue={t.status}
                        className="h-9 rounded-none border-2 border-ink bg-bg px-2 font-mono text-xs uppercase"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </AdminActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPaginator
        basePath="/admin/support"
        page={page}
        totalPages={totalPages}
        searchParams={{ status: q.status }}
      />
    </div>
  );
}
