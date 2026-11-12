import Link from "next/link";
import { Mail, UserPlus, Users } from "lucide-react";

import { AdminActionButton, AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { RecordCard } from "@/components/ui/record-card";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { RecordCollection } from "@/components/ui/record-collection";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createUserAction, deleteUserAction, updateUserAction } from "@/server/admin-actions";
import { getAdminUser, isAdminEmail, listUsers } from "@/server/admin";

type UserRow = Awaited<ReturnType<typeof listUsers>>["items"][number];

function RoleBadge({ role, envAdmin }: { role: "user" | "admin"; envAdmin: boolean }) {
  if (role === "admin") {
    return (
      <span className="inline-block border-2 border-ink bg-ink px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-bg">
        ADMIN
      </span>
    );
  }
  return envAdmin ? (
    <span className="flex flex-col gap-1">
      <span className="inline-block w-fit border-2 border-ink bg-surface px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em]">
        USER
      </span>
      <span className="font-mono text-[11px] leading-tight text-muted-foreground">
        + akses admin via ADMIN_EMAILS
      </span>
    </span>
  ) : (
    <span className="inline-block w-fit border-2 border-ink/40 bg-surface px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      USER
    </span>
  );
}

/**
 * Aksi baris user dipakai oleh tampilan daftar dan grid supaya perilaku
 * keduanya identik. Tombol ikon 44px (aria-label = submitLabel) supaya kolom
 * aksi sempit, terutama di handphone, tanpa mengorbankan nama aksesibel.
 */
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
        variant={suspended ? "secondary" : "destructive"}
        confirm={suspended ? undefined : `Suspend ${u.email}? Semua sesi aktif akan dicabut.`}
        confirmTitle={`Suspend ${u.email}`}
      />
      <AdminActionButton
        action={updateUserAction}
        hidden={{ userId: u.id, role: u.role === "admin" ? "user" : "admin" }}
        submitLabel={u.role === "admin" ? "Jadikan User" : "Jadikan Admin"}
        icon={u.role === "admin" ? "shieldOff" : "shieldCheck"}
        iconOnly
        variant="outline"
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
          variant="destructive"
          confirm={`Hapus ${u.email} permanen? Semua sesi dicabut dan data user hilang. Tindakan tidak bisa dibatalkan.`}
          confirmTitle={`Hapus ${u.email}`}
        />
      ) : null}
    </div>
  );
}

/**
 * Admin users - tambah/hapus user oleh CEO + suspend/reactivate + ubah role
 * (docs/10 §10.2). Pendaftaran mandiri publik ditutup; akun hanya lahir di sini.
 * Suspended user: sesi DB dihapus + login diblokir (docs/09 §10).
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const q = await searchParams;
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const [admin, { items, total }] = await Promise.all([
    getAdminUser(),
    listUsers({ search: q.search, page, limit: 20 }),
  ]);

  const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" });
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      <PageHeader
        eyebrow="ADMIN / PENGGUNA"
        title="Manajemen User"
        icon={Users}
        meta={`${total} user terdaftar`}
        description="Buat, suspend, dan ubah role akun platform. Pendaftaran mandiri ditutup."
        right={
          <form
            method="GET"
            className="flex w-full flex-wrap items-end gap-2 sm:w-auto"
            role="search"
          >
            <div className="flex w-full flex-col gap-1 sm:w-auto">
              <label
                htmlFor="user-search"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Cari email / nama
              </label>
              <Input
                id="user-search"
                name="search"
                defaultValue={q.search ?? ""}
                className="w-full sm:w-56"
                placeholder="cth. owner@klik.id"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              aria-label="Cari user"
              title="Cari user"
            >
              Cari
            </Button>
          </form>
        }
      />

      <section
        aria-labelledby="tambah-user"
        className="border-2 border-ink bg-muted p-4 shadow-hard"
      >
        <p
          id="tambah-user"
          className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-[0.15em]"
        >
          <UserPlus className="size-4" aria-hidden="true" />
          TAMBAH USER
        </p>
        <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
          Pendaftaran mandiri ditutup, akun baru hanya dibuat dari sini. Password minimal 8
          karakter; bagikan ke user secara aman.
        </p>
        <AdminActionForm
          action={createUserAction}
          submitLabel="Tambah User"
          pendingLabel="Menyimpan..."
          className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1fr_0.7fr_auto] lg:items-end"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="new-name" className="font-mono text-[11px] uppercase tracking-[0.12em]">
              Nama
            </label>
            <Input
              id="new-name"
              name="name"
              required
              maxLength={80}
              placeholder="cth. Budi Santoso"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="new-email"
              className="font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              Email
            </label>
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
            <label
              htmlFor="new-password"
              className="font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              Password
            </label>
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
            <BrutalistSelect
              id="new-role"
              name="role"
              label="Role"
              defaultValue="user"
              options={[
                { value: "user", label: "USER" },
                { value: "admin", label: "ADMIN" },
              ]}
            />
            <p className="font-mono text-[11px] leading-tight text-muted-foreground">
              user = dashboard bisnis · admin = kelola platform
            </p>
          </div>
        </AdminActionForm>
      </section>

      {items.length === 0 ? (
        <AdminEmptyState
          heading="TIDAK ADA USER"
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
              <span className="font-mono">{q.search}</span>. Coba kata kunci lain atau hapus filter.
            </>
          ) : (
            "Belum ada user terdaftar. Tambah akun pertama lewat formulir di atas."
          )}
        </AdminEmptyState>
      ) : (
        <RecordCollection
          storageKey="snapyos.view.admin.users"
          label="Daftar user"
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
                  <TableRow key={u.id} className="align-top">
                    <TableCell className="font-bold">
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="inline-flex min-h-11 items-center underline decoration-ink/40 underline-offset-2 hover:bg-muted"
                      >
                        {u.email}
                      </Link>
                      {!u.email_verified ? (
                        <span className="ml-1 inline-block border-2 border-ink/40 px-1 text-[11px] uppercase text-muted-foreground">
                          belum verifikasi
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {u.name ?? "-"}
                      {u.whatsapp ? (
                        <span className="block font-mono text-[11px] text-muted-foreground">
                          WA {u.whatsapp}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <RoleBadge
                        role={u.role}
                        envAdmin={u.role !== "admin" && isAdminEmail(u.email)}
                      />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={u.status === "suspended" ? "inactive" : "active"} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {u.businesses.length > 0 ? (
                        <ul className="flex flex-col gap-1">
                          {u.businesses.map((b) => (
                            <li key={b.id}>
                              <Link
                                href={`/admin/businesses?search=${encodeURIComponent(b.slug)}`}
                                className="inline-flex min-h-11 items-center font-bold underline decoration-ink/40 underline-offset-2 hover:bg-muted"
                              >
                                {b.name}
                              </Link>
                              <span className="block text-[11px] text-muted-foreground">
                                /p/{b.slug}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-[11px] uppercase text-muted-foreground">
                          belum punya bisnis
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground uppercase xl:table-cell">
                      {u.acquisition_source ?? "-"}
                      {u.planned_devices !== null ? ` · ${u.planned_devices} device` : ""}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {dateFmt.format(new Date(u.created_at))}
                      {u.signup_ip ? (
                        <span className="block text-[11px]">{u.signup_ip}</span>
                      ) : null}
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
                <RecordCard
                  key={u.id}
                  title={
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="underline decoration-ink/40 underline-offset-2 hover:bg-muted"
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
                      <StatusBadge status={u.status === "suspended" ? "inactive" : "active"} />
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
                      <p className="flex items-start gap-1 font-mono text-[11px] leading-tight text-muted-foreground">
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
      )}

      <AdminPaginator
        basePath="/admin/users"
        page={page}
        totalPages={totalPages}
        searchParams={{ search: q.search }}
      />
    </div>
  );
}
