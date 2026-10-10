import Link from "next/link";
import { AdminActionButton, AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createUserAction, deleteUserAction, updateUserAction } from "@/server/admin-actions";
import { getAdminUser, isAdminEmail, listUsers } from "@/server/admin";

function RoleBadge({ role, envAdmin }: { role: "user" | "admin"; envAdmin: boolean }) {
  if (role === "admin") {
    return (
      <span className="inline-block border-2 border-ink bg-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-bg">
        ADMIN
      </span>
    );
  }
  return envAdmin ? (
    <span className="flex flex-col gap-1">
      <span className="inline-block w-fit border-2 border-ink bg-surface px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em]">
        USER
      </span>
      <span className="font-mono text-[10px] leading-tight text-muted-foreground">
        + akses admin via ADMIN_EMAILS
      </span>
    </span>
  ) : (
    <span className="inline-block w-fit border-2 border-ink/30 bg-surface px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      USER
    </span>
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
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {"/// ADMIN - USERS"}
          </p>
          <h1 className="mt-2 font-display text-3xl uppercase tracking-tight md:text-4xl">
            Manajemen User
          </h1>
          <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
            {total} user terdaftar
          </p>
          <p className="mt-3 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
            <span className="font-bold text-ink">ADMIN</span> = kelola platform
            (halaman ini: users, plans, payments).{" "}
            <span className="font-bold text-ink">USER</span> = kelola bisnis
            sendiri (dashboard bisnis, outlet, photobox). Satu akun bisa dua-duanya
            - admin tinggal buka menu <span className="font-mono">DASHBOARD BISNIS</span>.
          </p>
        </div>
        <form method="GET" className="flex items-end gap-2" role="search">
          <div className="flex flex-col gap-1">
            <label htmlFor="user-search" className="font-mono text-[10px] uppercase tracking-[0.12em]">
              Cari email / nama
            </label>
            <Input id="user-search" name="search" defaultValue={q.search ?? ""} className="w-56" placeholder="cth. owner@klik.id" />
          </div>
          <Button type="submit" size="sm" variant="secondary">
            Cari
          </Button>
        </form>
      </header>

      <section aria-labelledby="tambah-user" className="border-2 border-ink bg-muted p-4 shadow-[4px_4px_0_0_#111111]">
        <p id="tambah-user" className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
          {"/// TAMBAH USER"}
        </p>
        <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
          Pendaftaran mandiri ditutup - akun baru hanya dibuat dari sini. Password
          minimal 8 karakter; bagikan ke user secara aman.
        </p>
        <AdminActionForm
          action={createUserAction}
          submitLabel="Tambah User"
          pendingLabel="Menyimpan…"
          className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1.4fr_1fr_0.7fr_auto] lg:items-end"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="new-name" className="font-mono text-[10px] uppercase tracking-[0.12em]">
              Nama
            </label>
            <Input id="new-name" name="name" required maxLength={80} placeholder="cth. Budi Santoso" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-email" className="font-mono text-[10px] uppercase tracking-[0.12em]">
              Email
            </label>
            <Input id="new-email" name="email" type="email" required maxLength={254} placeholder="user@klik.id" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="new-password" className="font-mono text-[10px] uppercase tracking-[0.12em]">
              Password
            </label>
            <Input id="new-password" name="password" type="password" required minLength={8} maxLength={72} placeholder="min. 8 karakter" />
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
              className="h-9"
            />
            <p className="font-mono text-[10px] leading-tight text-muted-foreground">
              user = dashboard bisnis · admin = kelola platform
            </p>
          </div>
        </AdminActionForm>
      </section>

      {items.length === 0 ? (
        <AdminEmptyState heading="/// TIDAK ADA USER">
          Tidak ada user yang cocok dengan pencarian{" "}
          <span className="font-mono">{q.search ?? "-"}</span>.
        </AdminEmptyState>
      ) : (
        <div className="overflow-x-auto border-2 border-ink shadow-[4px_4px_0_0_#111111]">
          <table className="w-full min-w-[1100px] border-collapse bg-surface text-left">
            <thead>
              <tr className="bg-ink font-mono text-[10px] uppercase tracking-[0.12em] text-bg">
                <th className="px-4 py-3 font-bold">Email</th>
                <th className="px-4 py-3 font-bold">Nama</th>
                <th className="px-4 py-3 font-bold">Role</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Bisnis</th>
                <th className="px-4 py-3 font-bold">Sumber</th>
                <th className="px-4 py-3 font-bold">Terdaftar</th>
                <th className="px-4 py-3 font-bold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-t-2 border-ink/10 align-top">
                  <td className="px-4 py-3 font-mono text-xs font-bold">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="underline decoration-ink/40 underline-offset-2 hover:bg-muted"
                    >
                      {u.email}
                    </Link>
                    {!u.email_verified ? (
                      <span className="ml-1 inline-block border-2 border-ink/30 px-1 font-mono text-[9px] uppercase text-muted-foreground">
                        belum verifikasi
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {u.name ?? "-"}
                    {u.whatsapp ? (
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        WA {u.whatsapp}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <RoleBadge role={u.role} envAdmin={u.role !== "admin" && isAdminEmail(u.email)} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={u.status === "suspended" ? "inactive" : "active"} />
                  </td>
                  <td className="px-4 py-3">
                    {u.businesses.length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {u.businesses.map((b) => (
                          <li key={b.id}>
                            <Link
                              href={`/admin/businesses?search=${encodeURIComponent(b.slug)}`}
                              className="font-mono text-xs font-bold underline decoration-ink/40 underline-offset-2 hover:bg-muted"
                            >
                              {b.name}
                            </Link>
                            <span className="block font-mono text-[10px] text-muted-foreground">
                              /p/{b.slug}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="font-mono text-[10px] uppercase text-muted-foreground">
                        - belum punya bisnis
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs uppercase text-muted-foreground">
                    {u.acquisition_source ?? "-"}
                    {u.planned_devices !== null ? ` · ${u.planned_devices} device` : ""}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {dateFmt.format(new Date(u.created_at))}
                    {u.signup_ip ? (
                      <span className="block text-[10px]">{u.signup_ip}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-start gap-2">
                      <AdminActionButton
                        action={updateUserAction}
                        hidden={{ userId: u.id, status: u.status === "suspended" ? "active" : "suspended" }}
                        submitLabel={u.status === "suspended" ? "Aktifkan" : "Suspend"}
                        variant={u.status === "suspended" ? "secondary" : "destructive"}
                        confirm={
                          u.status === "suspended"
                            ? undefined
                            : "Suspend user ini? Semua sesi aktif akan dicabut."
                        }
                      />
                      <AdminActionButton
                        action={updateUserAction}
                        hidden={{ userId: u.id, role: u.role === "admin" ? "user" : "admin" }}
                        submitLabel={u.role === "admin" ? "Jadikan User" : "Jadikan Admin"}
                        variant="outline"
                        confirm={
                          u.role === "admin"
                            ? "Turunkan role user ini menjadi user biasa?"
                            : "Naikkan role user ini menjadi admin platform?"
                        }
                      />
                      {admin && u.id !== admin.id ? (
                        <AdminActionButton
                          action={deleteUserAction}
                          hidden={{ userId: u.id }}
                          submitLabel="Hapus"
                          variant="destructive"
                          confirm="Hapus user ini permanen? Semua sesi dicabut dan data user hilang. Tindakan tidak bisa dibatalkan."
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
