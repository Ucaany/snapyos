"use client";

import { useMemo, useState } from "react";
import { MonitorSmartphone } from "lucide-react";

import { DeviceDialog } from "@/components/dashboard/DeviceDialog";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import type { PhotoboxRow } from "@/server/photoboxes";

type Props = {
  businessId: string;
  businessSlug: string;
  photoboxes: PhotoboxRow[];
  canWrite: boolean;
};

export function DeviceManagement({ businessId, businessSlug, photoboxes, canWrite }: Props) {
  const [filter, setFilter] = useState("all");
  const visible = useMemo(
    () => (filter === "all" ? photoboxes : photoboxes.filter((box) => box.status === filter)),
    [filter, photoboxes]
  );

  return (
    <div className="flex flex-col gap-8">
      <section
        className="border-2 border-ink bg-surface p-4 shadow-hard md:p-6"
        aria-labelledby="devices-heading"
      >
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-ink pb-4">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.14em]">
              Booth terdaftar
            </p>
            <h2
              id="devices-heading"
              className="mt-2 font-display text-2xl uppercase tracking-tight"
            >
              Pairing dan status
            </h2>
          </div>
          <label className="flex flex-col gap-1 font-mono text-xs font-bold uppercase tracking-[0.08em]">
            Filter booth
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="min-h-11 border-2 border-ink bg-bg px-2 py-2 text-xs"
            >
              <option value="all">Semua</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
              <option value="maintenance">Perawatan</option>
            </select>
          </label>
        </div>

        {visible.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              icon={MonitorSmartphone}
              eyebrow="BELUM ADA PERANGKAT"
              title="Tambahkan photobox dahulu"
              body="Buat booth dari menu Photobox, lalu kembali ke sini untuk membuat kode pairing."
            />
          </div>
        ) : (
          <ul className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visible.map((box) => (
              <li key={box.id} className="min-w-0 border-2 border-ink bg-bg p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold uppercase tracking-[0.08em]">
                      {box.name}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      /p/{businessSlug}/{box.slug}
                    </p>
                  </div>
                  <StatusBadge status={box.status} />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2 border-t-2 border-ink/20 pt-3 font-mono text-xs sm:grid-cols-3">
                  <span>Kamera: {box.camera ?? "-"}</span>
                  <span>Printer: {box.printer ?? "-"}</span>
                  <span>Display: {box.display ?? "-"}</span>
                  <span>
                    Versi:{" "}
                    {typeof box.device_status?.app_version === "string"
                      ? box.device_status.app_version
                      : "Belum dilaporkan"}
                  </span>
                  <span>
                    Diagnostik:{" "}
                    {box.device_status ? "Tersedia di detail perangkat" : "Belum dilaporkan"}
                  </span>
                </div>
                <div className="mt-4 flex justify-end">
                  <DeviceDialog
                    businessId={businessId}
                    businessSlug={businessSlug}
                    photobox={box}
                    canWrite={canWrite}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
