import Link from "next/link";
import { Building2, Mail, ShieldCheck, UserCheck, UserPlus, Users } from "lucide-react";

import { AdminActionButton, AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminFilterForm } from "@/components/admin/AdminFilterForm";
import { AdminMetricCard } from "@/components/admin/AdminMetricCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { AdminRecordCard } from "@/components/admin/AdminRecordCard";
import { AdminRecordCollection } from "@/components/admin/AdminRecordCollection";
import { AdminSectionHeading } from "@/components/admin/AdminSectionHeading";
import { AdminStatGrid } from "@/components/admin/AdminStatGrid";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Badge } from "@/components/admin/ui/badge";
import { Button, buttonVariants } from "@/components/admin/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import { Input } from "@/components/admin/ui/input";
import { Label } from "@/components/admin/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/admin/ui/table";
import { createUserAction, deleteUserAction, updateUserAction } from "@/server/admin-actions";
import { getAdminUser, getUserStats, isAdminEmail, listUsers } from "@/server/admin";

type UserRow = Awaited<ReturnType<typeof listUsers>>["items"][number];

function RoleBadge({ role, envAdmin }: { role: "user" | "admin"; envAdmin: boolean }) {
  if (role === "admin") {
    return <Badge>ADMIN</Badge>;
  }
  return (
    <span className="flex flex-col gap-1">
      <Badge variant="secondary">USER</Badge>
      {envAdmin ? (
        <span className="text-xs leading-tight text-muted-foreground">
          + akses admin via ADMIN_EMAILS
        </span>
      ) : null}
    </span>
  );
}

function UserRowActions({ u, adminId }: { u: UserRow; adminId?: string }) {
  const suspended = u.status === "suspended";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AdminActionButton
        action={updateUserAction}
        hidden={{ userId: u.id, status: suspended ? "active" : "suspended" }}
        submitLabel={suspended ? "Aktifkan" : "Suspend"}
        icon={suspended ? "circleCheck" : "ban"}
        iconOnly
        variant={suspended ? "neutral" : "destructive"}
        confirm={suspended ? undefined : `Suspend ${u.email}? Semua sesi aktif akan dicabut.`}
        confirmTitle={`Suspend ${u.email}`}
      />
      <AdminActionButton
        action={updateUserAction}
        hidden={{ userId: u.id, role: u.role === "admin" ? "user" : "admin" }}
        submitLabel={u.role === "admin" ? "Jadikan User" : "Jadikan Admin"}
        icon={u.role === "admin" ? "shieldOff" : "shieldCheck"}
        iconOnly
        variant="neutral"
        confirm={
          u.role === "admin"
            ? `Turunkan ${u.email} menjadi user biasa? Akses platform dicabut.`
            : `Naikkan ${u.email} menjadi admin platform? Akses penuh ke seluruh tenant.`
        }
        confirmTitle={u.role === "admin" ? "Turunkan role admin" : "Naikkan role admin"}
      />
      {adminId && u.id !== adminId ? (
        <AdminActionButton
          action={deleteUserAction}
          hidden={{ userId: u.id }}
          submitLabel="Hapus"
          icon="trash"
          iconOnly
          variant="destructive"
          confirm={`Hapus ${u.email} permanen? Semua sesi dicabut dan data user hilang. Tindakan tidak bisa dibatalkan.`}
          confirmTitle={`Hapus ${u.email}`}
        />
      ) : null}
    </div>
  );
}

/** Bar skala akun: nilai + porsi terhadap total, satu hue per baris. */
function AccountScale({
  rows,
  total,
}: {
  rows: { key: string; label: string; value: number; color: string }[];
  total: number;
}) {
  const numberFormat = new Intl.NumberFormat("id-ID");
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => {
        const share = total ? (row.value / total) * 100 : 0;
        return (
          <li key={row.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                  aria-hidden="true"
                />
                <span className="truncate text-sm">{row.label}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                <span className="text-sm font-medium">{numberFormat.format(row.value)}</span>
                <span className="w-10 text-right text-xs text-muted-foreground">
                  {share.toFixed(share >= 10 ? 0 : 1).replace(".", ",")}%
                </span>
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={`${row.label}: ${row.value} akun (${Math.round(share)}%)`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(share > 0 ? 2 : 0, share))}%`,
                  backgroundColor: row.color,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const q = await searchParams;
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const [admin, { items, total }, stats] = await Promise.all([
    getAdminUser(),
    listUsers({ search: q.search, page, limit: 20 }),
    getUserStats(),
  ]);

  const numberFormat = new Intl.NumberFormat("id-ID");
  const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const accountScale = [
    { key: "active", label: "Aktif", value: stats.active, color: "var(--chart-2)" },
    { key: "suspended", label: "Suspend", value: stats.suspended, color: "var(--chart-1)" },
    { key: "verified", label: "Terverifikasi", value: stats.verified, color: "var(--chart-3)" },
    {
      key: "unverified",
      label: "Belum verifikasi",
      value: stats.unverified,
      color: "var(--chart-4)",
    },
  ];

  return (
    <div className="admin-grid-lines flex flex-col gap-10">
      <AdminPageHeader
        size="hero"
        icon={Users}
        title="Manajemen User"
        description={`${numberFormat.format(total)} user terdaftar. Buat, suspend, dan ubah role akun platform. Pendaftaran mandiri ditutup.`}
      />

      <section aria-labelledby="admin-users-metrics" className="flex flex-col gap-4">
        <AdminSectionHeading
          id="admin-users-metrics"
          title="Ikhtisar"
          description="Angka kunci seluruh akun platform."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            accent
            tone="emerald"
            icon={Users}
            label="Total user"
            value={numberFormat.format(stats.total)}
            sub={`${numberFormat.format(stats.admins)} admin · ${numberFormat.format(stats.regular)} user`}
          />
          <AdminMetricCard
            tone="sky"
            icon={UserCheck}
            label="User aktif"
            value={numberFormat.format(stats.active)}
            sub={`${numberFormat.format(stats.suspended)} suspended`}
          />
          <AdminMetricCard
            tone="sky"
            icon={ShieldCheck}
            label="Terverifikasi"
            value={numberFormat.format(stats.verified)}
            sub={`${numberFormat.format(stats.unverified)} belum verifikasi`}
          />
          <AdminMetricCard
            tone="neutral"
            icon={Building2}
            label="Punya bisnis"
            value={numberFormat.format(stats.withBusiness)}
            sub={`${numberFormat.format(stats.withoutBusiness)} tanpa bisnis`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-7">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <UserCheck
                  className="size-4 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
                Skala akun
              </CardTitle>
              <CardDescription>
                Status, verifikasi, dan kepemilikan bisnis dari {numberFormat.format(stats.total)}{" "}
                akun.
              </CardDescription>
              <CardAction>
                <Badge variant="secondary">{numberFormat.format(stats.suspended)} suspend</Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-4">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Status &amp; verifikasi
                </h3>
                <AccountScale rows={accountScale} total={stats.total} />
                <p className="text-xs text-muted-foreground">
                  {numberFormat.format(stats.verified)} akun sudah memverifikasi email.
                </p>
              </div>

              <div className="flex flex-col gap-4 border-t pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-6">
                <h3 className="text-xs font-medium text-muted-foreground">Role &amp; bisnis</h3>
                <AdminStatGrid
                  columns={2}
                  items={[
                    { label: "User", value: numberFormat.format(stats.regular) },
                    { label: "Admin", value: numberFormat.format(stats.admins) },
                    { label: "Punya bisnis", value: numberFormat.format(stats.withBusiness) },
                    { label: "Tanpa bisnis", value: numberFormat.format(stats.withoutBusiness) },
                  ]}
                />
                <p className="text-xs text-muted-foreground">
                  Admin punya akses penuh ke seluruh tenant; user hanya dashboard bisnis.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-5">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="size-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                Tambah user
              </CardTitle>
              <CardDescription>
                Akun baru hanya dibuat dari sini. Password minimal 8 karakter.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AdminActionForm
                action={createUserAction}
                submitLabel="Tambah User"
                pendingLabel="Menyimpan..."
                className="flex flex-col gap-3"
              >
                <div className="flex flex-col gap-1">
                  <Label htmlFor="new-name" className="text-xs text-muted-foreground">
                    Nama
                  </Label>
                  <Input
                    id="new-name"
                    name="name"
                    required
                    maxLength={80}
                    placeholder="cth. Budi Santoso"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="new-email" className="text-xs text-muted-foreground">
                    Email
                  </Label>
                  <Input
                    id="new-email"
                    name="email"
                    type="email"
                    required
                    maxLength={254}
                    placeholder="user@klik.id"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="new-password" className="text-xs text-muted-foreground">
                    Password
                  </Label>
                  <Input
                    id="new-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    maxLength={72}
                    placeholder="min. 8 karakter"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <AdminSelect
                    id="new-role"
                    name="role"
                    label="Role"
                    defaultValue="user"
                    options={[
                      { value: "user", label: "USER" },
                      { value: "admin", label: "ADMIN" },
                    ]}
                  />
                  <p className="text-xs leading-tight text-muted-foreground">
                    user = dashboard bisnis · admin = kelola platform
                  </p>
                </div>
              </AdminActionForm>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <AdminRecordCollection
          storageKey="snapyos.view.admin.users"
          label="Daftar user"
          title="User terdaftar"
          description={`${numberFormat.format(total)} akun cocok filter saat ini.`}
          toolbar={
            <AdminFilterForm
              action="/admin/users"
              className="flex w-full flex-wrap items-end gap-2"
            >
              <div className="flex w-full flex-col gap-1 sm:w-auto">
                <Label htmlFor="user-search" className="text-xs text-muted-foreground">
                  Cari email / nama
                </Label>
                <Input
                  id="user-search"
                  name="search"
                  defaultValue={q.search ?? ""}
                  className="w-full sm:w-56"
                  placeholder="cth. owner@klik.id"
                />
              </div>
              <Button type="submit" size="sm" variant="outline" aria-label="Cari user">
                Cari
              </Button>
              {q.search ? (
                <Link
                  href="/admin/users"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Hapus filter
                </Link>
              ) : null}
            </AdminFilterForm>
          }
          empty={
            items.length === 0 ? (
              <AdminEmptyState
                heading="Tidak ada user"
                icon={Users}
                action={
                  q.search ? (
                    <Link
                      href="/admin/users"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Hapus filter
                    </Link>
                  ) : null
                }
              >
                {q.search ? (
                  <>
                    Tidak ada user yang cocok dengan pencarian{" "}
                    <span className="font-medium">{q.search}</span>. Coba kata kunci lain atau hapus
                    filter.
                  </>
                ) : (
                  "Belum ada user terdaftar. Tambah akun pertama lewat formulir di atas."
                )}
              </AdminEmptyState>
            ) : undefined
          }
          list={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="hidden md:table-cell">Nama</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Bisnis</TableHead>
                  <TableHead className="hidden xl:table-cell">Sumber</TableHead>
                  <TableHead className="hidden lg:table-cell">Terdaftar</TableHead>
                  <TableHead>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="whitespace-normal font-medium">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {u.email}
                      </Link>
                      {!u.email_verified ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          belum verifikasi
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden whitespace-normal md:table-cell">
                      {u.name ?? "-"}
                      {u.whatsapp ? (
                        <span className="block text-xs text-muted-foreground">WA {u.whatsapp}</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <RoleBadge
                        role={u.role}
                        envAdmin={u.role !== "admin" && isAdminEmail(u.email)}
                      />
                    </TableCell>
                    <TableCell>
                      <AdminStatusBadge status={u.status === "suspended" ? "inactive" : "active"} />
                    </TableCell>
                    <TableCell className="hidden whitespace-normal lg:table-cell">
                      {u.businesses.length > 0 ? (
                        <ul className="flex flex-col gap-1">
                          {u.businesses.map((b) => (
                            <li key={b.id}>
                              <Link
                                href={`/admin/businesses/${b.id}`}
                                className="font-medium underline-offset-2 hover:underline"
                              >
                                {b.name}
                              </Link>
                              <span className="block text-xs text-muted-foreground">
                                /p/{b.slug}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-muted-foreground">belum punya bisnis</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden whitespace-normal text-muted-foreground xl:table-cell">
                      {u.acquisition_source ?? "-"}
                      {u.planned_devices !== null ? ` · ${u.planned_devices} device` : ""}
                    </TableCell>
                    <TableCell className="hidden whitespace-normal text-muted-foreground lg:table-cell">
                      {dateFmt.format(new Date(u.created_at))}
                      {u.signup_ip ? <span className="block text-xs">{u.signup_ip}</span> : null}
                    </TableCell>
                    <TableCell>
                      <UserRowActions u={u} adminId={admin?.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
          grid={
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((u) => (
                <AdminRecordCard
                  key={u.id}
                  title={
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {u.email}
                    </Link>
                  }
                  subtitle={u.name ?? "Tanpa nama"}
                  badge={
                    <div className="flex flex-wrap justify-end gap-1">
                      <RoleBadge
                        role={u.role}
                        envAdmin={u.role !== "admin" && isAdminEmail(u.email)}
                      />
                      <AdminStatusBadge status={u.status === "suspended" ? "inactive" : "active"} />
                    </div>
                  }
                  meta={[
                    { label: "Bisnis", value: String(u.businesses.length) },
                    { label: "Terdaftar", value: dateFmt.format(new Date(u.created_at)) },
                    { label: "Sumber", value: u.acquisition_source ?? "-" },
                    { label: "Verifikasi", value: u.email_verified ? "Ya" : "Belum" },
                  ]}
                  footer={
                    u.businesses.length > 0 ? (
                      <p className="flex items-start gap-1 text-xs leading-tight text-muted-foreground">
                        <Mail className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 break-words">
                          {u.businesses.map((b) => b.name).join(", ")}
                        </span>
                      </p>
                    ) : null
                  }
                  actions={<UserRowActions u={u} adminId={admin?.id} />}
                />
              ))}
            </div>
          }
        />

        <AdminPaginator
          basePath="/admin/users"
          page={page}
          totalPages={totalPages}
          searchParams={{ search: q.search }}
        />
      </div>
    </div>
  );
}
