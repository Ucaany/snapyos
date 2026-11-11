"use client";

import { Fragment, useActionState, useState } from "react";
import { Package, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordCard } from "@/components/ui/record-card";
import { RecordCollection, RecordEditButton } from "@/components/ui/record-collection";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { DeleteConfirmForm } from "@/components/dashboard/DeleteConfirmForm";
import { PackageFields, type PackageRef } from "@/components/dashboard/PackageFields";
import { PackageEditForm } from "@/components/dashboard/PackageEditForm";
import { formatIDR } from "@/lib/dashboard-math";
import type { PackageRow } from "@/server/packages";
import type { FormState } from "@/server/auth-actions";
import { createPackageAction, deletePackageAction } from "@/server/catalog-actions";

const initial: FormState = {};

type Props = {
  packages: PackageRow[];
  templates: PackageRef[];
  outlets: PackageRef[];
  photoboxes: PackageRef[];
  canWrite: boolean;
};

/** PackagesTable - CRUD paket (docs/04 §4.9). */
export function PackagesTable({ packages, templates, outlets, photoboxes, canWrite }: Props) {
  const [createState, createAction, creating] = useActionState(createPackageAction, initial);
  const [editingId, setEditingId] = useState<string | null>(null);

  const table = (
    <div className="overflow-x-auto border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
      <table className="w-full border-collapse text-left lg:min-w-[860px]">
        <caption className="sr-only">Daftar paket</caption>
        <thead>
          <tr className="border-b-2 border-ink bg-ink font-mono text-[11px] uppercase tracking-[0.12em] text-bg">
            <th scope="col" className="px-4 py-3.5">
              Paket
            </th>
            <th scope="col" className="px-4 py-3.5 text-right">
              Harga
            </th>
            <th scope="col" className="hidden px-4 py-3.5 text-center md:table-cell">
              Foto
            </th>
            <th scope="col" className="hidden px-4 py-3.5 text-center md:table-cell">
              Cetak
            </th>
            <th scope="col" className="hidden px-4 py-3.5 text-center lg:table-cell">
              Digital
            </th>
            <th scope="col" className="hidden px-4 py-3.5 lg:table-cell">
              Mode
            </th>
            <th scope="col" className="hidden px-4 py-3.5 lg:table-cell">
              Penugasan
            </th>
            <th scope="col" className="px-4 py-3.5">
              Status
            </th>
            {canWrite && (
              <th scope="col" className="px-4 py-3.5 text-right">
                Aksi
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {packages.map((pkg) => (
            <Fragment key={pkg.id}>
              <tr className="border-b-2 border-ink/10 transition-colors hover:bg-muted/60">
                <td className="px-4 py-3">
                  <p className="font-mono text-sm font-bold uppercase tracking-[0.05em]">
                    {pkg.name}
                  </p>
                  {pkg.description && (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {pkg.description}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm font-bold tabular-nums">
                  {formatIDR(pkg.price)}
                </td>
                <td className="hidden px-4 py-3 text-center font-mono text-sm md:table-cell">
                  {pkg.photo_count}
                </td>
                <td className="hidden px-4 py-3 text-center font-mono text-sm md:table-cell">
                  {pkg.print_count}
                </td>
                <td className="hidden px-4 py-3 text-center font-mono text-xs uppercase lg:table-cell">
                  {pkg.digital_output ? "YA" : "-"}
                </td>
                <td className="hidden px-4 py-3 font-mono text-xs uppercase lg:table-cell">
                  {pkg.capture_mode}
                </td>
                <td className="hidden px-4 py-3 font-mono text-[11px] text-muted-foreground lg:table-cell">
                  {`${pkg.template_count} template \u00b7 ${pkg.outlet_count} outlet \u00b7 ${pkg.photobox_count} booth`}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={pkg.is_active ? "active" : "inactive"} />
                </td>
                {canWrite && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <RecordEditButton
                        label={`Ubah paket ${pkg.name}`}
                        onEdit={() => setEditingId(pkg.id)}
                      />
                      <DeleteConfirmForm
                        action={deletePackageAction}
                        id={pkg.id}
                        title="Hapus paket?"
                        description={`Paket ${pkg.name} akan dihapus permanen. Paket yang sedang aktif di kiosk tidak akan tersedia lagi.`}
                        triggerLabel={`Hapus paket ${pkg.name}`}
                        compact
                      />
                    </div>
                  </td>
                )}
              </tr>
              {editingId === pkg.id && canWrite && (
                <tr className="border-b-2 border-ink/10 bg-muted">
                  <td colSpan={9} className="px-4 py-3 md:px-6">
                    <PackageEditForm
                      pkg={pkg}
                      templates={templates}
                      outlets={outlets}
                      photoboxes={photoboxes}
                      onDone={() => setEditingId(null)}
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );

  const grid = (
    <ul
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      aria-label="Paket (tampilan kotak)"
    >
      {packages.map((pkg) => (
        <li key={pkg.id} className="min-w-0">
          <RecordCard
            title={pkg.name}
            subtitle={pkg.description ?? undefined}
            badge={<StatusBadge status={pkg.is_active ? "active" : "inactive"} />}
            meta={[
              { label: "Harga", value: formatIDR(pkg.price) },
              { label: "Foto", value: pkg.photo_count },
              { label: "Cetak", value: pkg.print_count },
              { label: "Digital", value: pkg.digital_output ? "Ya" : "-" },
              { label: "Mode", value: pkg.capture_mode },
              {
                label: "Penugasan",
                value: `${pkg.template_count} template · ${pkg.outlet_count} outlet · ${pkg.photobox_count} booth`,
              },
            ]}
            actions={
              canWrite ? (
                <>
                  <RecordEditButton
                    label={`Ubah paket ${pkg.name}`}
                    onEdit={() => setEditingId(pkg.id)}
                  />
                  <DeleteConfirmForm
                    action={deletePackageAction}
                    id={pkg.id}
                    title="Hapus paket?"
                    description={`Paket ${pkg.name} akan dihapus permanen. Paket yang sedang aktif di kiosk tidak akan tersedia lagi.`}
                    triggerLabel={`Hapus paket ${pkg.name}`}
                    compact
                  />
                </>
              ) : undefined
            }
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-6">
      {canWrite && (
        <Collapsible>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
              {`PAKET ${String(packages.length).padStart(2, "0")}`}
            </p>
            <CollapsibleTrigger aria-label="Buka form paket baru" title="Paket baru">
              <Plus aria-hidden />
              <span className="sr-only">Paket baru</span>
            </CollapsibleTrigger>
          </div>
          <CollapsiblePanel className="mt-4">
            <form
              action={createAction}
              className="flex flex-col gap-6 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111] md:p-6"
              noValidate
            >
              <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
                {"Paket baru"}
              </p>
              <PackageFields
                templates={templates}
                outlets={outlets}
                photoboxes={photoboxes}
                state={createState}
                pending={creating}
              />
              {createState.error && (
                <p
                  role="alert"
                  className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
                >
                  {createState.error}
                </p>
              )}
              <div className="flex justify-end border-t-2 border-ink/10 pt-4">
                <Button type="submit" size="sm" disabled={creating}>
                  {creating ? "Menyimpan\u2026" : "Simpan paket"}
                </Button>
              </div>
            </form>
          </CollapsiblePanel>
        </Collapsible>
      )}

      {packages.length === 0 ? (
        canWrite ? (
          <EmptyState
            icon={Package}
            eyebrow="BELUM ADA PAKET"
            title="Paket menentukan harga dan jumlah foto/cetak yang dilihat customer di kiosk."
            body="Contoh: BASIC Rp20.000 - 3 foto, 1 cetak, digital copy."
          />
        ) : (
          <EmptyState
            icon={Package}
            eyebrow="BELUM ADA PAKET"
            title="Belum ada paket untuk booth yang Anda akses."
            body="Minta owner menetapkan paket pada booth Anda lewat dashboard, lalu muat ulang halaman."
          />
        )
      ) : (
        <RecordCollection
          storageKey="snapyos.view.packages"
          label="Daftar paket"
          list={table}
          grid={grid}
        />
      )}
    </div>
  );
}
