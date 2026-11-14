import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";

import { AdminActionButton } from "@/components/admin/AdminActionForm";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminStatGrid } from "@/components/admin/AdminStatGrid";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { buttonVariants } from "@/components/admin/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/admin/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/admin/ui/table";
import { formatIDR } from "@/lib/dashboard-math";
import { getUserDetail } from "@/server/admin";
import { updateUserAction } from "@/server/admin-actions";

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

function MoneyCell({ amount, status }: { amount: number; status: string }) {
  return (
    <TableCell className="tabular-nums">
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

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        eyebrow="Admin / Pengguna / Detail"
        icon={Users}
        title={user.name ?? user.email}
        meta={`${user.email} · ${user.role.toUpperCase()} · Terdaftar ${dateFmt.format(new Date(user.created_at))}`}
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

      <Card>
        <CardContent>
          <AdminStatGrid
            columns={3}
            items={[
              { label: "Role", value: user.role.toUpperCase() },
              { label: "Status", value: (user.status ?? "active").toUpperCase() },
              { label: "Email", value: user.email_verified ? "Terverifikasi" : "Belum" },
              { label: "Bisnis", value: String(businesses.length) },
              { label: "Sesi", value: String(sessions) },
              { label: "Payment", value: String(payments) },
            ]}
          />
        </CardContent>
      </Card>

      {user.whatsapp || user.acquisition_source || user.signup_ip ? (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          {user.whatsapp ? <span>WA {user.whatsapp}</span> : null}
          {user.acquisition_source ? <span>Sumber {user.acquisition_source}</span> : null}
          {user.planned_devices !== null ? <span>{user.planned_devices} device</span> : null}
          {user.signup_ip ? <span>IP {user.signup_ip}</span> : null}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Bisnis</CardTitle>
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
                      href={`/admin/businesses?search=${encodeURIComponent(b.slug)}`}
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
                    <AdminStatusBadge status={b.status === "suspended" ? "inactive" : "active"} />
                    <AdminStatusBadge status={b.subscription_status ?? "expired"} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Riwayat invoice <span className="text-muted-foreground">({invoices.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada invoice.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="hidden sm:table-cell">Bisnis</TableHead>
                  <TableHead>Jumlah</TableHead>
                  <TableHead className="hidden md:table-cell">Dibuat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((i) => (
                  <TableRow key={i.id} className="align-top">
                    <TableCell className="font-medium">
                      {i.number}
                      <span className="block text-xs text-muted-foreground">
                        {i.paid_at ? `Paid ${dateFmt.format(new Date(i.paid_at))}` : "-"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{i.business_name}</TableCell>
                    <MoneyCell amount={i.amount} status={i.status} />
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {dateFmt.format(new Date(i.created_at))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Riwayat transaksi{" "}
            <span className="text-muted-foreground">({transactions.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada transaksi.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Transaksi</TableHead>
                  <TableHead className="hidden sm:table-cell">Bisnis</TableHead>
                  <TableHead>Jumlah</TableHead>
                  <TableHead className="hidden md:table-cell">Dibuat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id} className="align-top">
                    <TableCell className="font-medium">
                      {t.number}
                      <span className="block text-xs text-muted-foreground">
                        {t.paid_at ? `Paid ${dateFmt.format(new Date(t.paid_at))}` : "-"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{t.business_name}</TableCell>
                    <MoneyCell amount={t.final_amount} status={t.status} />
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {dateFmt.format(new Date(t.created_at))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
