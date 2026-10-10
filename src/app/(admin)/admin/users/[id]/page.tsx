import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminActionButton } from "@/components/admin/AdminActionForm";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { updateUserAction } from "@/server/admin-actions";
import { getUserDetail } from "@/server/admin";
import { formatIDR } from "@/lib/dashboard-math";

/**
 * Admin - detail user + riwayat (business, invoice, transaksi, payment).
 * docs/10 §10.2. Link masuk dari /admin/users.
 */

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

function MoneyCell({ amount, status }: { amount: number; status: string }) {
  return (
    <td className="px-4 py-2 font-mono text-xs tabular-nums">
      {formatIDR(amount)}
      {/* Satu sumber warna status: StatusBadge. Map duplikat di sini pernah
          drift (refunded text-ink di atas accent-4 = 3.2:1, gagal AA). */}
      <StatusBadge status={status} className="ml-2 h-5 px-1.5 text-[9px] tracking-[0.08em]" />
    </td>
  );
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail;
  try {
    detail = await getUserDetail(id);
  } catch {
    notFound();
  }

  const { user, businesses, invoices, transactions, sessions, payments } = detail;

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {"/// ADMIN - USERS / DETAIL"}
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">
              {user.name ?? user.email}
            </h1>
            <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
              {user.email} · {user.role.toUpperCase()} · TERDAFTAR{" "}
              {dateFmt.format(new Date(user.created_at))}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={user.status === "suspended" ? "inactive" : "active"} />
            <AdminActionButton
              action={updateUserAction}
              hidden={{ userId: user.id, status: user.status === "suspended" ? "active" : "suspended" }}
              submitLabel={user.status === "suspended" ? "Aktifkan" : "Suspend"}
              variant={user.status === "suspended" ? "secondary" : "destructive"}
              confirm={user.status === "suspended" ? undefined : "Suspend user ini? Semua sesi aktif akan dicabut."}
            />
            <AdminActionButton
              action={updateUserAction}
              hidden={{ userId: user.id, role: user.role === "admin" ? "user" : "admin" }}
              submitLabel={user.role === "admin" ? "Jadikan User" : "Jadikan Admin"}
              variant="outline"
              confirm={user.role === "admin" ? "Turunkan role user ini menjadi user biasa?" : "Naikkan role user ini menjadi admin platform?"}
            />
            <Link
              href="/admin/users"
              className="border-2 border-ink bg-surface px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] hover:bg-muted"
            >
              {"< KEMBALI"}
            </Link>
          </div>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-[2px] border-2 border-ink bg-ink md:grid-cols-6">
        {[
          { label: "Role", value: user.role.toUpperCase() },
          { label: "Status", value: (user.status ?? "active").toUpperCase() },
          { label: "Email", value: user.email_verified ? "VERIFIED" : "BELUM" },
          { label: "Bisnis", value: String(businesses.length) },
          { label: "Sesi", value: String(sessions) },
          { label: "Payment", value: String(payments) },
        ].map((cell) => (
          <div key={cell.label} className="flex flex-col gap-1 bg-surface p-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {cell.label}
            </dt>
            <dd className="font-mono text-sm font-bold leading-none">{cell.value}</dd>
          </div>
        ))}
      </dl>

      {user.whatsapp || user.acquisition_source || user.signup_ip ? (
        <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground">
          {user.whatsapp ? <span>WA {user.whatsapp}</span> : null}
          {user.acquisition_source ? <span>SUMBER {user.acquisition_source}</span> : null}
          {user.planned_devices !== null ? <span>{user.planned_devices} DEVICE</span> : null}
          {user.signup_ip ? <span>IP {user.signup_ip}</span> : null}
        </div>
      ) : null}

      <section aria-labelledby="businesses" className="flex flex-col gap-3">
        <h2 id="businesses" className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
          {"/// BISNIS"}
        </h2>
        {businesses.length === 0 ? (
          <p className="border-2 border-dashed border-ink/40 bg-muted p-4 font-mono text-xs uppercase text-muted-foreground">
            Belum punya bisnis
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {businesses.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 border-2 border-ink bg-surface p-3"
              >
                <span>
                  <Link
                    href={`/admin/businesses?search=${encodeURIComponent(b.slug)}`}
                    className="block text-sm font-bold underline decoration-ink/40 underline-offset-2 hover:bg-muted"
                  >
                    {b.name}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">
                    <Link
                      href={`/p/${b.slug}`}
                      target="_blank"
                      className="underline decoration-ink/40 underline-offset-2 hover:bg-muted"
                    >
                      /p/{b.slug}
                    </Link>{" "}
                    · {b.plan_name ?? "-"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge status={b.status === "suspended" ? "inactive" : "active"} />
                  <StatusBadge status={b.subscription_status ?? "expired"} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="invoices" className="flex flex-col gap-3">
        <h2 id="invoices" className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
          {"/// RIWAYAT INVOICE"} <span className="text-muted-foreground">({invoices.length})</span>
        </h2>
        {invoices.length === 0 ? (
          <p className="border-2 border-dashed border-ink/40 bg-muted p-4 font-mono text-xs uppercase text-muted-foreground">
            Tidak ada invoice
          </p>
        ) : (
          <div className="overflow-x-auto border-2 border-ink">
            <table className="w-full min-w-[640px] border-collapse bg-surface text-left">
              <thead>
                <tr className="bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                  <th className="px-4 py-2 font-bold">Invoice</th>
                  <th className="px-4 py-2 font-bold">Bisnis</th>
                  <th className="px-4 py-2 font-bold">Jumlah</th>
                  <th className="px-4 py-2 font-bold">Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-t-2 border-ink/10 align-top">
                    <td className="px-4 py-2 font-mono text-xs font-bold">
                      {i.number}
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {i.paid_at ? `PAID ${dateFmt.format(new Date(i.paid_at))}` : "-"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">{i.business_name}</td>
                    <MoneyCell amount={i.amount} status={i.status} />
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {dateFmt.format(new Date(i.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="transactions" className="flex flex-col gap-3">
        <h2 id="transactions" className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
          {"/// RIWAYAT TRANSAKSI"} <span className="text-muted-foreground">({transactions.length})</span>
        </h2>
        {transactions.length === 0 ? (
          <p className="border-2 border-dashed border-ink/40 bg-muted p-4 font-mono text-xs uppercase text-muted-foreground">
            Tidak ada transaksi
          </p>
        ) : (
          <div className="overflow-x-auto border-2 border-ink">
            <table className="w-full min-w-[640px] border-collapse bg-surface text-left">
              <thead>
                <tr className="bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                  <th className="px-4 py-2 font-bold">No. Transaksi</th>
                  <th className="px-4 py-2 font-bold">Bisnis</th>
                  <th className="px-4 py-2 font-bold">Jumlah</th>
                  <th className="px-4 py-2 font-bold">Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t-2 border-ink/10 align-top">
                    <td className="px-4 py-2 font-mono text-xs font-bold">
                      {t.number}
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {t.paid_at ? `PAID ${dateFmt.format(new Date(t.paid_at))}` : "-"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs">{t.business_name}</td>
                    <MoneyCell amount={t.final_amount} status={t.status} />
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {dateFmt.format(new Date(t.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
