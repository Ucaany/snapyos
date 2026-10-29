import Link from "next/link";
import { CreditCard, Filter } from "lucide-react";
import { AdminActionButton } from "@/components/admin/AdminActionForm";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toggleGatewayAction } from "@/server/admin-actions";
import { getGatewayState, GATEWAY_PROVIDERS } from "@/server/admin";

/**
 * Admin Payment Gateways - overview credential seluruh tenant + toggle global
 * per provider (docs/06 §6.5, docs/10 §10.3). Owner kelola credential-nya
 * sendiri; admin hanya melihat redacted + enable/disable global per provider.
 */

export default async function AdminGatewaysPage({
  searchParams,
}: {
  searchParams: Promise<{ provider?: string; page?: string }>;
}) {
  const q = await searchParams;
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const state = await getGatewayState({ provider: q.provider, page, limit: 20 });

  const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
  const totalPages = Math.max(1, Math.ceil(state.total / 20));

  return (
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <PageHeader
        eyebrow="ADMIN - PAYMENT GATEWAYS"
        icon={CreditCard}
        title="Payment Gateway"
        meta={`${state.total} CREDENTIAL · ENABLE/DISABLE GLOBAL PER PROVIDER`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Status Provider Global</CardTitle>
          <CardDescription>
            Nonaktifkan provider → credential aktif tenant dilewati (checkout fallback aggregator).
            Dana transaksi tidak pernah disimpan di sini - secret credential hanya di dashboard
            owner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-[2px] border-2 border-ink bg-ink sm:grid-cols-3">
            {GATEWAY_PROVIDERS.map((p) => {
              const st = state.providers[p];
              return (
                <div key={p} className="flex flex-col gap-3 bg-surface p-4">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="font-mono text-sm font-bold uppercase">{p}</dt>
                    <StatusBadge status={st.enabled ? "active" : "inactive"} />
                  </div>
                  <dd className="font-mono text-xs text-muted-foreground">
                    {st.activeCount}/{st.credentialCount} credential aktif
                  </dd>
                  <AdminActionButton
                    action={toggleGatewayAction}
                    hidden={{ provider: p, enabled: st.enabled ? "false" : "true" }}
                    submitLabel={st.enabled ? "Nonaktifkan" : "Aktifkan"}
                    variant={st.enabled ? "outline" : "secondary"}
                    confirm={
                      st.enabled
                        ? `Nonaktifkan provider ${p.toUpperCase()} global? Checkout tenant yang memakai provider ini akan fallback.`
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </dl>
        </CardContent>
      </Card>

      <form method="GET" className="flex flex-wrap items-end gap-3" role="search">
        <BrutalistSelect
          name="provider"
          label="Provider"
          defaultValue={q.provider ?? ""}
          options={[
            { value: "", label: "SEMUA" },
            ...GATEWAY_PROVIDERS.map((p) => ({ value: p, label: p.toUpperCase() })),
          ]}
        />
        <Button
          type="submit"
          size="icon"
          variant="secondary"
          aria-label="Filter provider"
          title="Filter provider"
        >
          <Filter className="size-4" aria-hidden="true" />
        </Button>
      </form>

      {state.credentials.length === 0 ? (
        <div className="flex flex-col items-start gap-2 border-2 border-dashed border-ink/40 bg-muted p-8">
          <p className="font-mono text-sm font-bold uppercase tracking-[0.15em]">
            {"BELUM ADA CREDENTIAL"}
          </p>
          <p className="max-w-[55ch] text-sm leading-relaxed text-muted-foreground">
            Belum ada tenant yang memasang credential direct merchant. Owner mengelola dari{" "}
            <Link
              href="/dashboard/payment"
              className="font-bold underline decoration-ink/40 underline-offset-2 hover:bg-muted"
            >
              /dashboard/payment
            </Link>
            .
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bisnis</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead className="hidden md:table-cell">Merchant ID</TableHead>
              <TableHead className="hidden lg:table-cell">Environment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Dibuat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.credentials.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-sm font-bold">{c.business_name}</TableCell>
                <TableCell className="font-bold uppercase">{c.provider}</TableCell>
                <TableCell className="hidden md:table-cell">{c.merchant_id}</TableCell>
                <TableCell className="hidden uppercase lg:table-cell">{c.environment}</TableCell>
                <TableCell>
                  <StatusBadge status={c.is_active ? "active" : "inactive"} />
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {dateFmt.format(new Date(c.created_at))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 ? (
        <AdminPaginator
          basePath="/admin/gateways"
          page={page}
          totalPages={totalPages}
          searchParams={{ provider: q.provider }}
        />
      ) : null}
    </div>
  );
}
