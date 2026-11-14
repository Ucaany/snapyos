import Link from "next/link";
import { CreditCard, Filter } from "lucide-react";
import { AdminActionButton } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminFilterForm } from "@/components/admin/AdminFilterForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { AdminRecordCard } from "@/components/admin/AdminRecordCard";
import { AdminRecordCollection } from "@/components/admin/AdminRecordCollection";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Button, buttonVariants } from "@/components/admin/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/admin/ui/table";
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
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={CreditCard}
        title="Payment Gateway"
        meta={`${state.total} CREDENTIAL · ENABLE/DISABLE GLOBAL PER PROVIDER`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Status Provider Global</CardTitle>
          <CardDescription>
            Nonaktifkan provider → credential aktif tenant dilewati. Tanpa credential aktif, kiosk
            hanya menerima voucher dan tunai. Dana transaksi tidak pernah disimpan di sini - secret
            credential hanya di dashboard owner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-0 sm:divide-x">
            {GATEWAY_PROVIDERS.map((p) => {
              const st = state.providers[p];
              return (
                <div key={p} className="flex flex-col gap-3 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-sm font-medium">{p}</dt>
                    <AdminStatusBadge status={st.enabled ? "active" : "inactive"} />
                  </div>
                  <dd className="text-xs text-muted-foreground">
                    {st.activeCount}/{st.credentialCount} credential aktif
                  </dd>
                  <AdminActionButton
                    action={toggleGatewayAction}
                    hidden={{ provider: p, enabled: st.enabled ? "false" : "true" }}
                    submitLabel={st.enabled ? "Nonaktifkan" : "Aktifkan"}
                    variant="neutral"
                    confirm={
                      st.enabled
                        ? `Nonaktifkan provider ${p.toUpperCase()} global? Checkout tenant yang memakai provider ini ditolak; tanpa credential aktif kiosk hanya menerima voucher dan tunai.`
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </dl>
        </CardContent>
      </Card>

      <AdminFilterForm action="/admin/gateways" className="flex flex-wrap items-end gap-3">
        <AdminSelect
          name="provider"
          label="Provider"
          defaultValue={q.provider ?? ""}
          options={[
            { value: "", label: "SEMUA" },
            ...GATEWAY_PROVIDERS.map((p) => ({ value: p, label: p.toUpperCase() })),
          ]}
        />
        <Button type="submit" size="sm" variant="outline">
          <Filter className="size-4" aria-hidden="true" />
          Terapkan
        </Button>
        {q.provider ? (
          <Link href="/admin/gateways" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Hapus filter
          </Link>
        ) : null}
      </AdminFilterForm>

      {state.credentials.length === 0 ? (
        <AdminEmptyState heading="Belum ada credential" icon={CreditCard}>
          Belum ada tenant yang memasang credential direct merchant. Owner mengelola dari{" "}
          <Link
            href="/dashboard/payment"
            className="font-medium underline decoration-muted-foreground/40 underline-offset-2 hover:bg-muted"
          >
            /dashboard/payment
          </Link>
          .
        </AdminEmptyState>
      ) : (
        <AdminRecordCollection
          storageKey="snapyos.view.admin.gateways"
          label="Daftar credential gateway"
          list={
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
                    <TableCell className="text-sm font-medium">{c.business_name}</TableCell>
                    <TableCell className="font-medium">{c.provider}</TableCell>
                    <TableCell className="hidden md:table-cell">{c.merchant_id}</TableCell>
                    <TableCell className="hidden lg:table-cell">{c.environment}</TableCell>
                    <TableCell>
                      <AdminStatusBadge status={c.is_active ? "active" : "inactive"} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {dateFmt.format(new Date(c.created_at))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
          grid={
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {state.credentials.map((c) => (
                <AdminRecordCard
                  key={c.id}
                  title={c.business_name}
                  subtitle={`${c.provider.toUpperCase()} · ${c.environment.toUpperCase()}`}
                  badge={<AdminStatusBadge status={c.is_active ? "active" : "inactive"} />}
                  meta={[
                    { label: "Merchant ID", value: c.merchant_id },
                    { label: "Dibuat", value: dateFmt.format(new Date(c.created_at)) },
                  ]}
                />
              ))}
            </div>
          }
        />
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
