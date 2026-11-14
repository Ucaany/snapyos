import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Camera, CreditCard, Receipt, Users } from "lucide-react";

import { AdminActionButton } from "@/components/admin/AdminActionForm";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPagedTable } from "@/components/admin/AdminPagedBlocks";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminSectionHeading } from "@/components/admin/AdminSectionHeading";
import { AdminStatGrid } from "@/components/admin/AdminStatGrid";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { Badge } from "@/components/admin/ui/badge";
import { buttonVariants } from "@/components/admin/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import { TableCell, TableHead, TableRow } from "@/components/admin/ui/table";
import { formatIDR } from "@/lib/dashboard-math";
import { getUserDetail } from "@/server/admin";
import { updateUserAction } from "@/server/admin-actions";

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

function MoneyCell({ amount, status }: { amount: number; status: string }) {
  return (
    <TableCell className="text-right tabular-nums">
      {formatIDR(amount)}
      <AdminStatusBadge status={status} className="ml-2 px-1.5" />
    </TableCell>
  );
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let detail;
  try {
    detail = await getUserDetail(id);
  } catch {
    notFound();
  }

  const { user, businesses, invoices, transactions, sessions, payments } = detail;
  const numberFormat = new Intl.NumberFormat("id-ID");

  return (
    <div className="admin-grid-lines flex flex-col gap-10">
      <AdminPageHeader
        size="hero"
        icon={Users}
        title={user.name ?? user.email}
        description={`${user.email} · ${user.role.toUpperCase()} · Terdaftar ${dateFmt.format(new Date(user.created_at))}.`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <AdminStatusBadge status={user.status === "suspended" ? "inactive" : "active"} />
            <AdminActionButton
              action={updateUserAction}
              hidden={{
                userId: user.id,
                status: user.status === "suspended" ? "active" : "suspended",
              }}
              submitLabel={user.status === "suspended" ? "Aktifkan" : "Suspend"}
              icon={user.status === "suspended" ? "circleCheck" : "ban"}
              iconOnly
              variant={user.status === "suspended" ? "neutral" : "destructive"}
              confirm={
                user.status === "suspended"
                  ? undefined
                  : "Suspend user ini? Semua sesi aktif akan dicabut."
              }
            />
            <AdminActionButton
              action={updateUserAction}
              hidden={{ userId: user.id, role: user.role === "admin" ? "user" : "admin" }}
              submitLabel={user.role === "admin" ? "Jadikan User" : "Jadikan Admin"}
              icon={user.role === "admin" ? "shieldOff" : "shieldCheck"}
              iconOnly
              variant="neutral"
              confirm={
                user.role === "admin"
                  ? "Turunkan role user ini menjadi user biasa?"
                  : "Naikkan role user ini menjadi admin platform?"
              }
            />
            <Link
              href="/admin/users"
              aria-label="Kembali ke daftar user"
              title="Kembali ke daftar user"
              className={buttonVariants({ variant: "outline", size: "icon" })}
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
            </Link>
          </div>
        }
      />

      <section aria-labelledby="admin-user-detail-metrics" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-user-detail-metrics"
          title="Ikhtisar"
          description="Ringkasan akun dan jejak operasional."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            accent
            tone="emerald"
            icon={Building2}
            label="Bisnis"
            value={numberFormat.format(businesses.length)}
            sub={`${numberFormat.format(sessions)} sesi foto`}
          />
          <AdminMetricCard
            tone="sky"
            icon={Camera}
            label="Sesi foto"
            value={numberFormat.format(sessions)}
            sub={`${numberFormat.format(transactions.length)} transaksi terakhir`}
          />
          <AdminMetricCard
            tone="sky"
            icon={CreditCard}
            label="Payment"
            value={numberFormat.format(payments)}
            sub="Seluruh payment tenant"
          />
          <AdminMetricCard
            tone="neutral"
            icon={Receipt}
            label="Invoice"
            value={numberFormat.format(invoices.length)}
            sub="Riwayat terakhir"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-7">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <Users
                  className="size-4 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Profil akun
              </CardTitle>
              <CardDescription>
                Identitas, role, dan sumber pendaftaran akun platform.
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">{user.role.toUpperCase()}</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <AdminStatGrid
                columns={2}
                items={[
                  { label: "Role", value: user.role.toUpperCase() },
                  { label: "Status", value: (user.status ?? "active").toUpperCase() },
                  { label: "Email", value: user.email_verified ? "Terverifikasi" : "Belum" },
                  { label: "Bisnis", value: numberFormat.format(businesses.length) },
                  { label: "Sesi", value: numberFormat.format(sessions) },
                  { label: "Payment", value: numberFormat.format(payments) },
                ]}
              />
              {user.whatsapp || user.acquisition_source || user.signup_ip ? (
                <div className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-4 text-xs text-muted-foreground">
                  {user.whatsapp ? <span>WA {user.whatsapp}</span> : null}
                  {user.acquisition_source ? <span>Sumber {user.acquisition_source}</span> : null}
                  {user.planned_devices !== null ? (
                    <span>{user.planned_devices} device</span>
                  ) : null}
                  {user.signup_ip ? <span>IP {user.signup_ip}</span> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="xl:col-span-5">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                Bisnis
              </CardTitle>
              <CardDescription>Tenant yang dimiliki akun ini.</CardDescription>
              <CardAction>
                <Badge variant="secondary">{numberFormat.format(businesses.length)}</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              {businesses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum punya bisnis.</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {businesses.map((b) => (
                    <li
                      key={b.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="min-w-0">
                        <Link
                          href={`/admin/businesses/${b.id}`}
                          className="block text-sm font-medium underline-offset-2 hover:underline"
                        >
                          {b.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          <Link
                            href={`/p/${b.slug}`}
                            target="_blank"
                            className="underline-offset-2 hover:underline"
                          >
                            /p/{b.slug}
                          </Link>{" "}
                          · {b.plan_name ?? "-"}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <AdminStatusBadge
                          status={b.status === "suspended" ? "inactive" : "active"}
                        />
                        <AdminStatusBadge status={b.subscription_status ?? "expired"} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="admin-user-detail-invoices" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-user-detail-invoices"
          title="Invoice"
          description="Riwayat invoice tenant milik akun ini."
        />
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Receipt
                className="size-4 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              Riwayat invoice
            </CardTitle>
            <CardDescription>Maksimal 100 invoice terakhir.</CardDescription>
            <CardAction>
              <Badge variant="secondary">{numberFormat.format(invoices.length)}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada invoice.</p>
            ) : (
              <AdminPagedTable
                itemLabel="invoice"
                pageSize={5}
                header={
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead className="hidden sm:table-cell">Bisnis</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead className="hidden md:table-cell">Dibuat</TableHead>
                  </TableRow>
                }
                rows={invoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-normal font-medium">
                      {i.number}
                      <span className="block text-xs text-muted-foreground">
                        {i.paid_at ? `Paid ${dateFmt.format(new Date(i.paid_at))}` : "-"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden whitespace-normal sm:table-cell">
                      {i.business_name}
                    </TableCell>
                    <MoneyCell amount={i.amount} status={i.status} />
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {dateFmt.format(new Date(i.created_at))}
                    </TableCell>
                  </TableRow>
                ))}
              />
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="admin-user-detail-transactions" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-user-detail-transactions"
          title="Transaksi"
          description="Riwayat transaksi tenant milik akun ini."
        />
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="size-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              Riwayat transaksi
            </CardTitle>
            <CardDescription>Maksimal 100 transaksi terakhir.</CardDescription>
            <CardAction>
              <Badge variant="secondary">{numberFormat.format(transactions.length)}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada transaksi.</p>
            ) : (
              <AdminPagedTable
                itemLabel="transaksi"
                pageSize={5}
                header={
                  <TableRow>
                    <TableHead>No. Transaksi</TableHead>
                    <TableHead className="hidden sm:table-cell">Bisnis</TableHead>
                    <TableHead className="text-right">Jumlah</TableHead>
                    <TableHead className="hidden md:table-cell">Dibuat</TableHead>
                  </TableRow>
                }
                rows={transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-normal font-medium">
                      {t.number}
                      <span className="block text-xs text-muted-foreground">
                        {t.paid_at ? `Paid ${dateFmt.format(new Date(t.paid_at))}` : "-"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden whitespace-normal sm:table-cell">
                      {t.business_name}
                    </TableCell>
                    <MoneyCell amount={t.final_amount} status={t.status} />
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {dateFmt.format(new Date(t.created_at))}
                    </TableCell>
                  </TableRow>
                ))}
              />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
