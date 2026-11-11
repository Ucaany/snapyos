"use client";

import { Fragment, useActionState, useEffect, useRef, useState } from "react";
import {
  DoorOpen,
  ReceiptText,
  Save,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { RecordCard } from "@/components/ui/record-card";
import { RecordCollection, RecordEditButton } from "@/components/ui/record-collection";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LABEL_CLASS as labelClass, fieldError } from "@/lib/form-ui";
import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/dashboard-math";
import type { StaffDirectoryRow } from "@/lib/staff-directory";
import type { FormState } from "@/server/auth-actions";
import {
  inviteStaffAction,
  removeStaffAction,
  setStaffPinAction,
  updateStaffBoothsAction,
  updateStaffRoleAction,
} from "@/server/staff-actions";

const initial: FormState = {};

const ROLE_DESC: Record<string, string> = {
  owner: "Akses penuh (termasuk staff, billing, settings)",
  manager: "Operasional + finance, tanpa staff & billing",
  staff: "Operasional photobox, tanpa info finansial",
};

const STATUS_STYLE: Record<string, string> = {
  online: "bg-accent-3",
  maintenance: "bg-accent",
  offline: "bg-muted",
};

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="border-2 border-ink bg-surface p-4 shadow-hard md:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </p>
        <Icon className="size-4" aria-hidden />
      </div>
      <p className="mt-3 font-display text-2xl uppercase tracking-tight md:text-3xl">{value}</p>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
        {sub}
      </p>
    </div>
  );
}

/**
 * Baris inline error brutalist untuk aksi staff (role/hapus/booths).
 * Dipakai bila action mengembalikan FormState.error (STEP 15).
 */
function InlineActionError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="mt-2 border-2 border-destructive bg-destructive/10 px-2 py-1 font-mono text-[11px] leading-tight text-ink"
    >
      {message}
    </p>
  );
}

/** Form update role — memakai useActionState karena action kini mengembalikan FormState. */
function RoleForm({ member, currentUserId }: { member: StaffDirectoryRow; currentUserId: string }) {
  const [state, action, pending] = useActionState(updateStaffRoleAction, initial);
  return (
    <>
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="user_id" value={member.userId} />
        <select
          key={member.role}
          id={`role-${member.userId}`}
          name="role"
          defaultValue={member.role}
          disabled={pending || member.userId === currentUserId}
          aria-label={`Role ${member.name ?? member.email}`}
          className="h-11 border-2 border-ink bg-surface px-2 font-mono text-xs uppercase shadow-hard-sm disabled:opacity-60"
        >
          <option value="owner">OWNER</option>
          <option value="manager">MANAGER</option>
          <option value="staff">STAFF</option>
        </select>
        <IconButton
          type="submit"
          variant="outline"
          label={`Simpan role ${member.name ?? member.email}`}
          icon={Save}
          compact
          disabled={pending || member.userId === currentUserId}
        />
      </form>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
        {ROLE_DESC[member.role]}
      </p>
      <InlineActionError message={state.error} />
    </>
  );
}

/** Form hapus staff — pending state + inline error + ConfirmDialog. */
function RemoveForm({
  member,
  currentUserId,
}: {
  member: StaffDirectoryRow;
  currentUserId: string;
}) {
  const [state, action, pending] = useActionState(removeStaffAction, initial);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const disabled = pending || member.userId === currentUserId;

  return (
    <div className="flex flex-col items-end">
      <form ref={formRef} action={action} className="inline-flex">
        <input type="hidden" name="user_id" value={member.userId} />
        <Button
          type="button"
          variant="destructive"
          size="icon-compact"
          aria-label={`Keluarkan ${member.email}`}
          disabled={disabled}
          title={
            member.userId === currentUserId
              ? "Tidak bisa mengeluarkan sendiri"
              : "Keluarkan dari business"
          }
          className="relative after:absolute after:-inset-1"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 aria-hidden />
        </Button>
      </form>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Keluarkan staff?"
        description={`${member.email ?? "Staff ini"} akan kehilangan akses ke business ini segera. Riwayat aktivitas tetap tersimpan.`}
        confirmLabel="Keluarkan"
        variant="destructive"
        onConfirm={() => {
          formRef.current?.requestSubmit();
        }}
      />
      <InlineActionError message={state.error} />
    </div>
  );
}

/** Input PIN login staff per booth (0043). Kosongkan = hapus PIN. */
function PinField({
  member,
  booth,
}: {
  member: StaffDirectoryRow;
  booth: { id: string; name: string };
}) {
  const [state, action, pending] = useActionState(setStaffPinAction, initial);
  const pinError = fieldError(state, "pin");
  return (
    <div className="mt-2">
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="user_id" value={member.userId} />
        <input type="hidden" name="photobox_id" value={booth.id} />
        <Input
          name="pin"
          type="password"
          inputMode="numeric"
          maxLength={6}
          placeholder="PIN 4–6 digit"
          autoComplete="off"
          disabled={pending}
          aria-label={`PIN login ${booth.name}`}
          aria-invalid={Boolean(pinError)}
          className="min-h-11 max-w-[120px] font-mono text-xs"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "…" : "Set"}
        </Button>
      </form>
      {pinError && (
        <p role="alert" className="mt-1 font-mono text-[11px] leading-tight text-destructive">
          {pinError}
        </p>
      )}
      <InlineActionError message={state.error} />
    </div>
  );
}

/**
 * Editor akses booth — useActionState + useEffect: menutup panel bila
 * submit sukses (state.error kosong DAN sudah pernah submit).
 */
function BoothsEditor({
  member,
  photoboxes,
  onClose,
}: {
  member: StaffDirectoryRow;
  photoboxes: { id: string; name: string; status: string; outletName: string | null }[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(updateStaffBoothsAction, initial);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (submitted && !pending && state.error === undefined) {
      onClose();
    }
  }, [submitted, pending, state.error, onClose]);

  return (
    <div>
      <form action={action} onSubmit={() => setSubmitted(true)}>
        <input type="hidden" name="user_id" value={member.userId} />
        <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
          {`Akses booth: ${member.name ?? member.email ?? ""}`}
        </p>
        {photoboxes.length === 0 ? (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            Belum ada photobox di business ini. Buat photobox dahulu di menu Photobox.
          </p>
        ) : (
          <fieldset className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <legend className="sr-only">Pilih photobox yang bisa diakses</legend>
            {photoboxes.map((booth) => (
              <label
                key={booth.id}
                className="flex cursor-pointer items-center gap-3 border-2 border-ink bg-surface px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  name="photobox_ids"
                  value={booth.id}
                  defaultChecked={member.booths.some((b) => b.id === booth.id)}
                  disabled={pending}
                  className="size-4 accent-ink"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs font-bold uppercase tracking-[0.05em]">
                    {booth.name}
                  </span>
                  {booth.outletName && (
                    <span className="block truncate font-mono text-[10px] uppercase text-muted-foreground">
                      {booth.outletName}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "border-2 border-ink px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase",
                    STATUS_STYLE[booth.status] ?? "bg-muted"
                  )}
                >
                  {booth.status}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={pending}>
            <Save aria-hidden />
            {pending ? "Menyimpan…" : "Simpan akses"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={pending}>
            Batal
          </Button>
          <p className="font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
            Tanpa centang = tanpa akses booth.
          </p>
        </div>
        <InlineActionError message={state.error} />
      </form>

      {member.booths.length > 0 && (
        <div className="mt-5 border-t-2 border-ink/10 pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            {"PIN login per booth (staff)"}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {member.booths.map((booth) => (
              <div key={booth.id} className="border-2 border-ink bg-surface p-3">
                <p className="truncate font-mono text-xs font-bold uppercase tracking-[0.05em]">
                  {booth.name}
                </p>
                <PinField member={member} booth={booth} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** StaffPanel — invite + role + akses booth + transaksi hari ini (docs/04 §4.13, 0018). */
export function StaffPanel({
  staff,
  totals,
  photoboxes,
  currentUserId,
  maxStaff,
}: {
  staff: StaffDirectoryRow[];
  totals: { count: number; revenue: number };
  photoboxes: { id: string; name: string; status: string; outletName: string | null }[];
  currentUserId: string;
  maxStaff: number;
}) {
  const [inviteState, inviteAction, inviting] = useActionState(inviteStaffAction, initial);
  const [editingBooths, setEditingBooths] = useState<string | null>(null);

  // Tampilan grid tidak memuat form role; tombol "Ubah role" memindahkan ke
  // tampilan daftar lalu memfokuskan select role anggota tersebut.
  function focusRoleField(userId: string) {
    requestAnimationFrame(() => {
      document.getElementById(`role-${userId}`)?.focus();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatTile
          icon={Users}
          label="Member"
          value={`${staff.length}/${maxStaff}`}
          sub="Termasuk owner"
        />
        <StatTile
          icon={ReceiptText}
          label="Transaksi hari ini"
          value={String(totals.count)}
          sub="Status PAID · semua booth"
        />
        <StatTile
          icon={Wallet}
          label="Omzet hari ini"
          value={formatIDR(totals.revenue)}
          sub="Total PAID · semua booth"
        />
      </div>

      <form
        action={inviteAction}
        className="flex flex-col gap-6 border-2 border-ink bg-surface p-5 shadow-hard md:p-6"
        noValidate
      >
        <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">{"Tambah staff"}</p>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="flex flex-col gap-2">
            <label htmlFor="staff-email" className={labelClass}>
              Email akun SnapyOS *
            </label>
            <Input
              id="staff-email"
              name="email"
              type="email"
              required
              placeholder="staff@klikfoto.id"
              disabled={inviting}
              aria-invalid={Boolean(fieldError(inviteState, "email"))}
            />
            {fieldError(inviteState, "email") && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {fieldError(inviteState, "email")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="staff-role" className={labelClass}>
              Role *
            </label>
            <Select id="staff-role" name="role" defaultValue="staff" disabled={inviting}>
              <option value="manager">MANAGER</option>
              <option value="staff">STAFF</option>
            </Select>
            <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
              {ROLE_DESC.manager}
            </p>
          </div>
          <div className="flex items-end">
            <IconButton
              type="submit"
              variant="default"
              label={inviting ? "Menambahkan staff" : "Tambahkan staff"}
              icon={UserPlus}
              compact
              disabled={inviting}
            />
          </div>
        </div>
        {inviteState.error && (
          <p
            role="alert"
            className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
          >
            {inviteState.error}
          </p>
        )}
        <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
          Akun harus sudah terdaftar di SnapyOS: hubungi admin platform bila belum ada. Kuota:{" "}
          {staff.length}/{maxStaff} (termasuk owner).
        </p>
      </form>

      {staff.length === 0 ? (
        <EmptyState
          icon={UserCog}
          eyebrow="BELUM ADA MEMBER"
          title="Tambahkan staf melalui formulir undangan untuk mengatur peran dan akses booth."
        />
      ) : (
        <RecordCollection
          storageKey="snapyos.view.staff"
          label="Daftar staff"
          list={
            <div className="overflow-x-auto border-2 border-ink bg-surface shadow-hard">
              <table className="w-full border-collapse text-left lg:min-w-[960px]">
                <caption className="sr-only">
                  Daftar staff, role, akses booth, dan transaksi hari ini
                </caption>
                <thead>
                  <tr className="border-b-2 border-ink bg-ink font-mono text-[11px] uppercase tracking-[0.12em] text-bg">
                    <th scope="col" className="px-4 py-3.5">
                      Anggota
                    </th>
                    <th scope="col" className="px-4 py-3.5">
                      Peran
                    </th>
                    <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
                      Akses booth
                    </th>
                    <th scope="col" className="hidden px-4 py-3.5 md:table-cell">
                      Transaksi Hari Ini
                    </th>
                    <th scope="col" className="px-4 py-3.5 text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((member) => (
                    <Fragment key={member.userId}>
                      <tr className="border-b-2 border-ink/10 transition-colors hover:bg-muted/60">
                        <td className="px-4 py-3">
                          <p className="font-mono text-sm font-bold uppercase tracking-[0.05em]">
                            {member.name ?? "-"}
                            {member.userId === currentUserId && (
                              <span className="ml-2 border-2 border-ink bg-accent px-1.5 py-0.5 text-[10px]">
                                ANDA
                              </span>
                            )}
                          </p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <RoleForm member={member} currentUserId={currentUserId} />
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          {member.role === "owner" ? (
                            <p className="font-mono text-xs font-bold uppercase tracking-[0.05em]">
                              Semua booth
                            </p>
                          ) : member.booths.length === 0 ? (
                            <span className="inline-block border-2 border-dashed border-ink/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
                              Belum diatur
                            </span>
                          ) : (
                            <div className="flex max-w-[280px] flex-wrap items-center gap-1.5">
                              {member.booths.slice(0, 3).map((booth) => (
                                <span
                                  key={booth.id}
                                  className="border-2 border-ink bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase"
                                >
                                  {booth.name}
                                </span>
                              ))}
                              {member.booths.length > 3 && (
                                <span className="border-2 border-ink bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase">
                                  +{member.booths.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell">
                          <p className="font-mono text-sm font-bold">{member.todayCount}</p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">
                            {formatIDR(member.todayRevenue)}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-start justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-compact"
                              aria-label={`Atur akses booth ${member.name ?? member.email ?? ""}`}
                              title={
                                member.role === "owner"
                                  ? "Owner otomatis akses semua booth"
                                  : "Atur booth yang bisa diakses"
                              }
                              disabled={member.role === "owner"}
                              className="relative after:absolute after:-inset-1"
                              onClick={() =>
                                setEditingBooths((prev) =>
                                  prev === member.userId ? null : member.userId
                                )
                              }
                            >
                              <DoorOpen aria-hidden />
                            </Button>
                            <RemoveForm member={member} currentUserId={currentUserId} />
                          </div>
                        </td>
                      </tr>
                      {editingBooths === member.userId && (
                        <tr className="border-b-2 border-ink/10 bg-muted/40">
                          <td colSpan={5} className="px-4 py-5">
                            <BoothsEditor
                              member={member}
                              photoboxes={photoboxes}
                              onClose={() => setEditingBooths(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          }
          grid={
            <ul
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
              aria-label="Staff (tampilan kotak)"
            >
              {staff.map((member) => (
                <li key={member.userId} className="min-w-0">
                  <RecordCard
                    title={
                      <>
                        {member.name ?? "-"}
                        {member.userId === currentUserId && (
                          <span className="ml-2 border-2 border-ink bg-accent px-1.5 py-0.5 text-[10px]">
                            ANDA
                          </span>
                        )}
                      </>
                    }
                    subtitle={member.email}
                    badge={
                      <span className="border-2 border-ink bg-muted px-2 py-1 font-mono text-[10px] font-bold uppercase">
                        {member.role}
                      </span>
                    }
                    meta={[
                      {
                        label: "Akses booth",
                        value:
                          member.role === "owner"
                            ? "Semua booth"
                            : member.booths.length === 0
                              ? "Belum diatur"
                              : `${member.booths
                                  .slice(0, 3)
                                  .map((b) => b.name)
                                  .join(" · ")}${
                                  member.booths.length > 3 ? ` +${member.booths.length - 3}` : ""
                                }`,
                      },
                      {
                        label: "Transaksi hari ini",
                        value: `${member.todayCount} · ${formatIDR(member.todayRevenue)}`,
                      },
                    ]}
                    footer={
                      <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                        {ROLE_DESC[member.role]}
                      </p>
                    }
                    actions={
                      <>
                        {member.role === "owner" ? (
                          <IconButton
                            label="Owner otomatis akses semua booth"
                            icon={DoorOpen}
                            compact
                            disabled
                          />
                        ) : (
                          <RecordEditButton
                            label={`Atur akses booth ${member.name ?? member.email ?? ""}`}
                            icon={DoorOpen}
                            onEdit={() => setEditingBooths(member.userId)}
                          />
                        )}
                        <RecordEditButton
                          label={`Ubah role ${member.name ?? member.email ?? ""}`}
                          icon={UserCog}
                          onEdit={() => focusRoleField(member.userId)}
                        />
                        <RemoveForm member={member} currentUserId={currentUserId} />
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          }
        />
      )}
    </div>
  );
}
