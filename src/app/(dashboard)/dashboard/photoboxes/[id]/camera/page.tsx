import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { CameraTest } from "@/components/dashboard/CameraTest";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { parseUuidParam } from "@/lib/uuid-param";
import { getPhotoboxCameraConfig } from "@/server/photoboxes";

export const metadata: Metadata = {
  title: "Kamera & Cetak — SnapyOS",
};

type Props = { params: Promise<{ id: string }> };

/** /dashboard/photoboxes/[id]/camera — Kamera & Cetak (docs/05 §5.5).
 *  Preview live + foto + retake + mirror toggle (persist ke kiosk).
 *  Pengaturan lengkap kamera/printer/sesi/template ada di form edit booth. */
export default async function CameraTestPage({ params }: Props) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  if (!can(active.role, "photobox:read")) {
    redirect("/dashboard/photoboxes");
  }
  const canWrite = can(active.role, "photobox:write");

  const { id } = await params;

  // Non-UUID → 404 (bukan 500 dari Postgres invalid uuid); docs/03 §3.5.
  let photoboxId: string;
  try {
    photoboxId = parseUuidParam(id, "id");
  } catch {
    notFound();
  }

  let config;
  try {
    config = await getPhotoboxCameraConfig(user.id, active.business.id, photoboxId);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header className="flex flex-col gap-3">
        <Link
          href="/dashboard/photoboxes"
          className="inline-flex min-h-11 w-fit items-center gap-2 py-2 font-mono text-xs uppercase tracking-[0.05em] text-muted-foreground hover:text-ink"
        >
          <ChevronLeft className="size-4" aria-hidden /> Kembali ke photobox
        </Link>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {"/// KAMERA & CETAK — " + active.role.toUpperCase()}
        </p>
        <h1 className="font-display text-4xl uppercase tracking-tight md:text-5xl">
          Kamera & cetak
        </h1>
        <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
          Uji kamera booth sebelum live. Ambil foto, retake, dan atur mirror
          preview — pengaturan mirror disimpan otomatis dan dipakai kiosk
          customer. Pengaturan kamera lengkap (countdown, resolusi, rotasi,
          zoom), printer (kertas, salinan, margin), dan sesi diatur di form
          ubah booth.
        </p>
        {canWrite && (
          <Link
            href="/dashboard/photoboxes"
            className="inline-flex min-h-11 w-fit items-center gap-2 border-2 border-ink bg-accent px-4 py-2.5 font-mono text-xs font-bold uppercase tracking-[0.1em] shadow-[3px_3px_0_0_#111111] hover:shadow-[2px_2px_0_0_#111111]"
          >
            Atur kamera, printer & sesi
          </Link>
        )}
      </header>

      <CameraTest
        photoboxId={config.id}
        photoboxName={config.name}
        cameraSettings={config.camera_settings}
        canWrite={canWrite}
      />
    </div>
  );
}
