import { AccessDeniedPanel } from "@/components/dashboard/AccessDeniedPanel";
import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Filter } from "lucide-react";

import { DateRangeFilter } from "@/components/dashboard/DateRangeFilter";
import { PreserveSearchParams } from "@/components/dashboard/PreserveSearchParams";
import { TransactionsView } from "@/components/dashboard/TransactionsView";
import { IconButton } from "@/components/ui/icon-button";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listTransactions } from "@/server/transactions";
import { listOutlets } from "@/server/outlets";
import { listPhotoboxes } from "@/server/photoboxes";
import { listPackages } from "@/server/packages";

export const metadata: Metadata = {
  title: "Transaksi | SnapyOS",
};

const inputClass =
  "h-11 w-full rounded-none border-2 border-ink bg-surface px-3 font-mono text-sm shadow-hard-sm outline-none focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:w-auto";

const STATUS_OPTIONS = ["paid", "pending", "failed", "cancelled", "refunded"];
const METHOD_OPTIONS = ["qris", "cash", "bank_transfer", "other", "offline", "manual", "voucher"];
const SOURCE_OPTIONS = ["pos", "kiosk"];

/** Query params /dashboard/transactions — mirror `transactionListQuerySchema`
 *  (`src/lib/validators.ts`) supaya kontrak URL & backend eksplisit. */
type TransactionsSearchParams = {
  q?: string;
  status?: string;
  method?: string;
  source?: string;
  outlet?: string;
  photobox?: string;
  package?: string;
  from?: string;
  to?: string;
  page?: string;
  limit?: string;
};

/** /dashboard/transactions — daftar + filter + catat manual (docs/04 §4.5). */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<TransactionsSearchParams>;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  if (!can(active.role, "transaction:read")) {
    return (
      <PageShell>
        <AccessDeniedPanel resource="revenue" />
      </PageShell>
    );
  }
  // Form catat manual = owner-only (transaksi manual non-withdrawable).
  const canWrite = can(active.role, "transaction:manual-create");

  const query = await searchParams;
  const businessId = active.business.id;

  // Query URL bertipe longgar (string); `listTransactions` mem-parse via
  // `transactionListQuerySchema` (safeParse — nilai rusak dibuang, bukan throw).
  const [result, outlets, photoboxes, packages] = await Promise.all([
    listTransactions(user.id, businessId, query),
    listOutlets(user.id, businessId),
    listPhotoboxes(user.id, businessId),
    listPackages(user.id, businessId),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / result.limit));
  const pageHref = (page: number) => {
    const params = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== "") as [string, string][]
    );
    params.set("page", String(page));
    return `/dashboard/transactions?${params.toString()}`;
  };

  return (
    <PageShell>
      <PageHeader
        eyebrow={`${result.total} TRANSAKSI DITEMUKAN`}
        title="Transaksi"
        description="Semua transaksi bisnis. Diskon tercatat terpisah dan tidak dihitung sebagai revenue."
        right={
          <DateRangeFilter
            from={result.range.from}
            to={result.range.to}
            timeZone={active.business.timezone || "Asia/Jakarta"}
            basePath="/dashboard/transactions"
          />
        }
      />

      <form
        method="get"
        action="/dashboard/transactions"
        className="grid grid-cols-2 gap-3 border-2 border-ink bg-surface p-4 shadow-hard md:grid-cols-7"
        aria-label="Filter transaksi"
      >
        <PreserveSearchParams
          current={query}
          except={["q", "status", "method", "source", "outlet", "page"]}
        />
        <input
          type="text"
          name="q"
          defaultValue={query.q ?? ""}
          placeholder="Cari nomor / pelanggan"
          className={`${inputClass} col-span-2`}
          aria-label="Cari transaksi"
        />
        <Select name="status" defaultValue={query.status ?? ""} aria-label="Filter status">
          <option value="">Semua status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.toUpperCase()}
            </option>
          ))}
        </Select>
        <Select name="method" defaultValue={query.method ?? ""} aria-label="Filter metode">
          <option value="">Semua metode</option>
          {METHOD_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m.toUpperCase()}
            </option>
          ))}
        </Select>
        <Select name="source" defaultValue={query.source ?? ""} aria-label="Filter sumber">
          <option value="">Semua sumber</option>
          {SOURCE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.toUpperCase()}
            </option>
          ))}
        </Select>
        <Select name="outlet" defaultValue={query.outlet ?? ""} aria-label="Filter outlet">
          <option value="">Semua outlet</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
        <IconButton
          type="submit"
          variant="default"
          label="Terapkan filter"
          compact
          className="col-span-2 justify-self-end md:col-span-1"
        >
          <Filter className="size-4" aria-hidden="true" />
        </IconButton>
      </form>

      <TransactionsView
        transactions={result.rows}
        outlets={outlets.map((o) => ({ id: o.id, name: o.name }))}
        photoboxes={photoboxes.map((b) => ({ id: b.id, name: b.name, outlet_id: b.outlet_id }))}
        packages={packages.map((p) => ({ id: p.id, name: p.name }))}
        canWrite={canWrite}
        page={result.page}
        totalPages={totalPages}
        prevHref={result.page > 1 ? pageHref(result.page - 1) : null}
        nextHref={result.page < totalPages ? pageHref(result.page + 1) : null}
        timeZone={active.business.timezone || "Asia/Jakarta"}
      />
    </PageShell>
  );
}
