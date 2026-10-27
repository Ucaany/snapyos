import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CustomersTable } from "@/components/dashboard/CustomersTable";
import { PreserveSearchParams } from "@/components/dashboard/PreserveSearchParams";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listCustomers } from "@/server/customers";

export const metadata: Metadata = {
  title: "Pelanggan | SnapyOS",
};

/** /dashboard/customers — list + detail (docs/04 §4.12). */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  if (!can(active.role, "customer:read")) {
    return (
      <div className="p-6 md:p-10">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle>Akses terbatas</CardTitle>
            <CardDescription>
              Role {active.role.toUpperCase()} tidak melihat data customer.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const query = await searchParams;
  const result = await listCustomers(user.id, active.business.id, {
    q: query.q,
    page: query.page ? Number(query.page) : undefined,
  });
  const totalPages = Math.max(1, Math.ceil(result.total / result.limit));

  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    params.set("page", String(page));
    return `/dashboard/customers?${params.toString()}`;
  };

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow={`${result.total} PELANGGAN`}
        title="Pelanggan"
        description="Data pelanggan ditampilkan berdasarkan informasi yang diberikan saat transaksi."
        right={
          <form
            method="get"
            action="/dashboard/customers"
            className="flex gap-2"
            aria-label="Cari pelanggan"
          >
            <PreserveSearchParams current={query} except={["q", "page"]} />
            <input
              type="text"
              name="q"
              defaultValue={query.q ?? ""}
              placeholder="Nama / telepon / email"
              aria-label="Cari pelanggan"
              className="h-11 w-full rounded-none border-2 border-ink bg-surface px-3 font-mono text-sm shadow-[2px_2px_0_0_#111111] outline-none focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:w-64"
            />
            <button
              type="submit"
              className="h-11 border-2 border-ink bg-accent px-4 font-mono text-xs font-bold uppercase tracking-[0.08em] shadow-[2px_2px_0_0_#111111] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Cari
            </button>
          </form>
        }
      />

      <CustomersTable
        customers={result.rows}
        businessId={active.business.id}
        page={result.page}
        totalPages={totalPages}
        prevHref={result.page > 1 ? pageHref(result.page - 1) : null}
        nextHref={result.page < totalPages ? pageHref(result.page + 1) : null}
        timeZone={active.business.timezone || "Asia/Jakarta"}
      />
    </div>
  );
}
