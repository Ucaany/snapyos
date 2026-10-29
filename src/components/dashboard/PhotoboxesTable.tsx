"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Camera, ChevronDown, Pencil, Plus } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { RecordCard } from "@/components/ui/record-card";
import {
  RecordCollection,
  RecordEditButton,
} from "@/components/ui/record-collection";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PhotoboxForm } from "@/components/dashboard/PhotoboxForm";
import { DeviceDialog } from "@/components/dashboard/DeviceDialog";
import { DeleteConfirmForm } from "@/components/dashboard/DeleteConfirmForm";
import type { PhotoboxRow } from "@/server/photoboxes";
import { deletePhotoboxAction } from "@/server/booth-actions";

type Props = {
  photoboxes: PhotoboxRow[];
  outlets: { id: string; name: string }[];
  businessId: string;
  businessSlug: string;
  canWrite: boolean;
  maxPhotoboxes: number;
  pwaKioskEnabled?: boolean;
};

/**
 * PhotoboxesTable - daftar booth + URL publik + status device (docs/04 §4.6).
 * Desktop memakai tabel padat; handphone memakai kartu satu entitas per blok.
 */
export function PhotoboxesTable({
  photoboxes,
  outlets,
  businessId,
  businessSlug,
  canWrite,
  maxPhotoboxes,
  pwaKioskEnabled = false,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDone, setCreateDone] = useState(false);

  const limitReached = photoboxes.length >= maxPhotoboxes;
  const noOutlet = outlets.length === 0;
  const legacyPinBooths = photoboxes.filter((p) => p.has_legacy_exit_pin);
  const noPinBooths = photoboxes.filter((p) => !p.has_exit_pin);

  const table = (
    <div className="overflow-x-auto border-2 border-ink shadow-[4px_4px_0_0_#111111]">
      <table className="w-full border-collapse bg-surface text-left lg:min-w-[820px]">
        <caption className="sr-only">Daftar photobox</caption>
        <thead>
          <tr className="border-b-2 border-ink bg-ink font-mono text-[11px] uppercase tracking-[0.12em] text-bg">
            <th scope="col" className="px-4 py-3">
              Booth
            </th>
            <th scope="col" className="hidden px-4 py-3 md:table-cell">
              URL Perangkat
            </th>
            <th scope="col" className="hidden px-4 py-3 md:table-cell">
              Outlet
            </th>
            <th scope="col" className="px-4 py-3">
              Status
            </th>
            <th scope="col" className="hidden px-4 py-3 lg:table-cell">
              Perangkat
            </th>
            {canWrite && (
              <th scope="col" className="px-4 py-3 text-right">
                Aksi
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {photoboxes.map((box) => (
            <Fragment key={box.id}>
              <tr className="border-b-2 border-ink/10 font-mono text-xs">
                <td className="px-4 py-3 font-bold uppercase tracking-[0.05em]">{box.name}</td>
                <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                  /p/{businessSlug}/{box.slug}
                </td>
                <td className="hidden px-4 py-3 md:table-cell">{box.outlet_name ?? "-"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={box.status} />
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  <span className="flex flex-wrap items-center gap-2">
                    {[box.camera, box.printer, box.display].filter(Boolean).join(" · ") || (
                      <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        Belum ada perangkat terdeteksi
                      </span>
                    )}
                    {box.chroma_key_enabled && (
                      <span className="border-2 border-ink bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase">
                        CHROMA KEY
                      </span>
                    )}
                  </span>
                </td>
                {canWrite && (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <DeviceDialog
                        businessId={businessId}
                        businessSlug={businessSlug}
                        photobox={box}
                        canWrite={canWrite}
                        pwaKioskEnabled={pwaKioskEnabled}
                      />
                      <IconButton
                        label={`Ubah photobox ${box.name}`}
                        icon={Pencil}
                        compact
                        aria-expanded={editingId === box.id}
                        onClick={() => setEditingId(editingId === box.id ? null : box.id)}
                      />
                      <DeleteConfirmForm
                        action={deletePhotoboxAction}
                        id={box.id}
                        title="Hapus photobox?"
                        description={`Photobox ${box.name} akan dihapus permanen. Device terkait akan berhenti aktif. Riwayat transaksi tetap tersimpan.`}
                        triggerLabel={`Hapus photobox ${box.name}`}
                        compact
                      />
                    </div>
                  </td>
                )}
              </tr>
              {editingId === box.id && canWrite && (
                <tr className="border-b-2 border-ink/10 bg-muted">
                  <td colSpan={6} className="px-4 py-3">
                    <PhotoboxForm
                      outlets={outlets}
                      photobox={box}
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
      aria-label="Photobox (tampilan kotak)"
    >
      {photoboxes.map((box) => (
        <li key={box.id} className="min-w-0">
          <RecordCard
            title={box.name}
            subtitle={`/p/${businessSlug}/${box.slug}`}
            badge={<StatusBadge status={box.status} />}
            meta={[
              { label: "Outlet", value: box.outlet_name ?? "-" },
              {
                label: "Perangkat",
                value:
                  [box.camera, box.printer, box.display].filter(Boolean).join(" · ") ||
                  "Belum terdeteksi",
              },
              ...(box.chroma_key_enabled
                ? [{ label: "Chroma key", value: "Aktif" }]
                : [{ label: "PIN keluar", value: box.has_exit_pin ? "Aktif" : "Belum diatur" }]),
            ]}
            actions={
              canWrite ? (
                <>
                  <DeviceDialog
                    businessId={businessId}
                    businessSlug={businessSlug}
                    photobox={box}
                    canWrite={canWrite}
                    pwaKioskEnabled={pwaKioskEnabled}
                  />
                  <RecordEditButton
                    label={`Ubah photobox ${box.name}`}
                    onEdit={() => setEditingId(box.id)}
                  />
                  <DeleteConfirmForm
                    action={deletePhotoboxAction}
                    id={box.id}
                    title="Hapus photobox?"
                    description={`Photobox ${box.name} akan dihapus permanen. Device terkait akan berhenti aktif. Riwayat transaksi tetap tersimpan.`}
                    triggerLabel={`Hapus photobox ${box.name}`}
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
      {canWrite && noPinBooths.length > 0 && (
        <aside
          role="alert"
          className="border-2 border-ink bg-accent p-4 shadow-[4px_4px_0_0_#111111]"
        >
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
            {"PERINGATAN KEAMANAN · " + noPinBooths.length + " BOOTH TANPA PIN"}
          </p>
          <p className="mt-2 font-display text-base uppercase leading-tight">
            Booth ini keluar kiosk tanpa PIN
          </p>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-ink">
            Tanpa PIN, siapa pun bisa keluar dari mode kiosk dan mengakses perangkat booth. PIN
            keluar tidak lagi diubah dari dashboard.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-[0.06em]">
            {noPinBooths.map((b) => (
              <li key={b.id} className="border-2 border-ink bg-surface px-2 py-1 font-bold">
                {b.name}
              </li>
            ))}
          </ul>
        </aside>
      )}
      {canWrite && legacyPinBooths.length > 0 && (
        <aside
          role="alert"
          className="border-2 border-destructive bg-destructive/10 p-4 shadow-[4px_4px_0_0_#111111]"
        >
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-destructive">
            {"EXIT-PIN LEGACY · " + legacyPinBooths.length + " BOOTH"}
          </p>
          <p className="mt-2 font-display text-base uppercase leading-tight">
            Set ulang PIN keluar photobox
          </p>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-ink">
            Hash PIN lama (sha256) sudah tidak diterima; sistem sekarang memakai argon2id. Booth ini
            tidak bisa keluar kiosk dengan PIN sampai hash-nya diganti.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2 font-mono text-[11px] uppercase tracking-[0.06em]">
            {legacyPinBooths.map((b) => (
              <li key={b.id} className="border-2 border-ink bg-surface px-2 py-1 font-bold">
                {b.name}
              </li>
            ))}
          </ul>
        </aside>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
          {canWrite
            ? `PHOTOBOX ${String(photoboxes.length).padStart(2, "0")}/${String(maxPhotoboxes).padStart(2, "0")} - PLAN LIMIT`
            : `PHOTOBOX ${String(photoboxes.length).padStart(2, "0")} - AKSES ANDA`}
        </p>
        {canWrite && !limitReached && !noOutlet && (
          <Collapsible open={createOpen} onOpenChange={setCreateOpen}>
            <CollapsibleTrigger
              className="px-3"
              aria-label="Buka form photobox baru"
              title="Photobox baru"
            >
              <Plus className="size-4" aria-hidden />
              <span className="sr-only">Photobox baru</span>
              <ChevronDown
                className="size-4 transition-transform duration-100 [[data-panel-open]_&]:rotate-180"
                aria-hidden
              />
            </CollapsibleTrigger>
            <CollapsiblePanel className="mt-4">
              <PhotoboxForm
                outlets={outlets}
                onDone={() => {
                  setCreateOpen(false);
                  setCreateDone(true);
                }}
              />
            </CollapsiblePanel>
          </Collapsible>
        )}
      </div>

      {canWrite && createDone && (
        <p
          role="status"
          className="border-2 border-ink bg-accent-3 px-3 py-2 font-mono text-xs uppercase tracking-[0.05em] shadow-[4px_4px_0_0_#111111]"
        >
          {"[ OK ]"} Photobox tersimpan. URL perangkat siap dipakai di kiosk.
        </p>
      )}

      {canWrite && limitReached && !noOutlet && (
        <p className="border-2 border-ink bg-accent px-3 py-2 font-mono text-xs uppercase tracking-[0.05em]">
          {"[ LIMIT ]"} Kuota photobox plan tercapai ({maxPhotoboxes}). Upgrade subscription untuk
          menambah booth.
        </p>
      )}

      {canWrite && noOutlet && (
        <p className="border-2 border-dashed border-ink/40 bg-muted px-3 py-3 font-mono text-xs uppercase tracking-[0.05em]">
          {"BUTUH OUTLET"} - photobox harus terpasang di dalam outlet.{" "}
          <Link href="/dashboard/outlets" className="font-bold underline underline-offset-4">
            Buat outlet dahulu
          </Link>
          .
        </p>
      )}

      {photoboxes.length === 0 ? (
        canWrite ? (
          <EmptyState
            icon={Camera}
            eyebrow="BELUM ADA PHOTOBOX"
            title="Photobox adalah perangkat booth dengan URL kiosk sendiri."
            body="Perangkat (kamera/printer/display) terdeteksi otomatis saat device pairing."
          />
        ) : (
          <EmptyState
            icon={Camera}
            eyebrow="BELUM ADA BOOTH"
            title="Belum ada booth yang di-assign ke Anda."
            body="Minta owner memberi akses booth ini lewat menu Staff, lalu muat ulang halaman."
          />
        )
      ) : (
        <RecordCollection
          storageKey="snapyos.view.photoboxes"
          label="Daftar photobox"
          list={table}
          grid={grid}
        />
      )}
    </div>
  );
}