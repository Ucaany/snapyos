import Link from "next/link";
import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      <PageHeader
        eyebrow="ADMIN - SUPPORT TICKETS"
        title="Tiket Bantuan"
        meta={`SEMUA TENANT · ${total} TIKET COCOK FILTER`}
        right={
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
            <Button type="submit" size="sm" variant="secondary">
              Filter tiket
            </Button>
          </form>
        }
      />

      {items.length === 0 ? (
        <AdminEmptyState
          heading="TIDAK ADA TIKET"
          action={
            q.status ? (
              <Link
                href="/admin/support"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Hapus filter
              </Link>
            ) : null
          }
        >
          {q.status
            ? "Belum ada tiket dengan status ini. Hapus filter untuk melihat seluruh antrian."
            : "Belum ada tiket masuk. Tiket muncul di sini setelah owner mengirim laporan dari dashboard."}
        </AdminEmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subjek</TableHead>
              <TableHead className="hidden md:table-cell">Bisnis</TableHead>
              <TableHead className="hidden lg:table-cell">Kategori · Area</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Waktu</TableHead>
              <TableHead>Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="max-w-[280px] text-sm font-semibold">{t.subject}</TableCell>
                <TableCell className="hidden md:table-cell">{t.business_name}</TableCell>
                <TableCell className="hidden text-[11px] uppercase text-muted-foreground lg:table-cell">
                  {t.category} · {t.area}
                </TableCell>
                <TableCell>
                  <StatusBadge status={t.status} label={STATUS_LABEL[t.status]} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {dateFmt.format(new Date(t.created_at))}
                </TableCell>
                <TableCell>
                  <AdminActionForm
                    action={updateSupportTicketStatusAction}
                    hidden={{ ticketId: t.id }}
                    submitLabel="Simpan"
                    className="flex flex-wrap items-center gap-2"
                  >
                    <BrutalistSelect
                      name="status"
                      defaultValue={t.status}
                      aria-label={`Status tiket: ${t.subject}`}
                      options={STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
                    />
                  </AdminActionForm>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
