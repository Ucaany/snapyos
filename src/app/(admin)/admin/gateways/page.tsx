import Link from "next/link";
import { AdminActionButton } from "@/components/admin/AdminActionForm";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {"/// ADMIN - PAYMENT GATEWAYS"}
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-tight md:text-4xl">
          Payment Gateway
        </h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {state.total} CREDENTIAL · ENABLE/DISABLE GLOBAL PER PROVIDER
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Status Provider Global</CardTitle>
          <CardDescription>
            Nonaktifkan provider → credential aktif tenant dilewati (checkout
            fallback aggregator). Dana transaksi tidak pernah disimpan di sini -
            secret credential hanya di dashboard owner.
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
        <Button type="submit" size="sm" variant="secondary">
          Filter provider
        </Button>
      </form>

      {state.credentials.length === 0 ? (
        <div className="flex flex-col items-start gap-2 border-2 border-dashed border-ink/40 bg-muted p-8">
          <p className="font-mono text-sm font-bold uppercase tracking-[0.15em]">
            {"/// BELUM ADA CREDENTIAL"}
          </p>
          <p className="max-w-[55ch] text-sm leading-relaxed text-muted-foreground">
            Belum ada tenant yang memasang credential direct merchant. Owner
            mengelola dari{" "}
            <Link href="/dashboard/payment" className="font-bold underline decoration-ink/40 underline-offset-2 hover:bg-muted">
              /dashboard/payment
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border-2 border-ink shadow-[4px_4px_0_0_#111111]">
          <table className="w-full min-w-[960px] border-collapse bg-surface text-left">
            <thead>
              <tr className="bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                <th className="px-4 py-3 font-bold">Bisnis</th>
                <th className="px-4 py-3 font-bold">Provider</th>
                <th className="px-4 py-3 font-bold">Merchant ID</th>
                <th className="px-4 py-3 font-bold">Environment</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Dibuat</th>
              </tr>
            </thead>
            <tbody>
              {state.credentials.map((c) => (
                <tr key={c.id} className="border-t-2 border-ink/10">
                  <td className="px-4 py-3 text-sm font-bold">{c.business_name}</td>
                  <td className="px-4 py-3 font-mono text-xs uppercase font-bold">{c.provider}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.merchant_id}</td>
                  <td className="px-4 py-3 font-mono text-xs uppercase">{c.environment}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.is_active ? "active" : "inactive"} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {dateFmt.format(new Date(c.created_at))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
