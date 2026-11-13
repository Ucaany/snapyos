import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import {
  PhotoboxHardwarePanel,
  type HardwareDraft,
} from "@/components/dashboard/photobox-hardware";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { getActiveBusinessForRoles, requireUser } from "@/lib/tenant";
import { getPhotobox } from "@/server/photoboxes";
import { listTemplates } from "@/server/templates";

export const metadata: Metadata = { title: "Hardware Photobox | SnapyOS" };

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * /dashboard/photoboxes/:id/hardware — setelan printer + kamera per booth.
 * Owner/manager menulis ke kolom yang sama dengan panel PIN booth (override cloud).
 */
export default async function PhotoboxHardwarePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusinessForRoles(user.id, ["owner", "manager"]);
  if (!active) redirect("/dashboard");

  const canWrite = can(active.role, "photobox:write");

  let photobox;
  try {
    photobox = await getPhotobox(user.id, active.business.id, id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const templates = await listTemplates(user.id, active.business.id).catch(() => []);

  const photo = photobox.print_settings.photo ?? {};
  const thermal = photobox.print_settings.thermal ?? {};
  const receipt = photobox.print_settings.receipt ?? {};
  const camera = photobox.camera_settings;

  const initial: HardwareDraft = {
    photo: {
      enabled: photo.enabled !== false,
      mode: photo.mode ?? "browser",
      printer_name: photo.printer_name ?? "",
      paper_size: photo.paper_size ?? "4x6",
      orientation: photo.orientation ?? "portrait",
      fit: photo.fit ?? "auto",
      margins_mm: num(photo.margins_mm, 0),
      media_name: photo.media_name ?? "",
      strip_2up: photo.strip_2up === true,
      auto_print: photo.auto_print === true,
      bridge_url: photo.bridge_url ?? photobox.print_settings.bridge_url ?? "",
    },
    thermal: {
      enabled: thermal.enabled !== false,
      paper_width_mm: thermal.paper_width_mm === 58 ? 58 : 80,
      printer_name: thermal.printer_name ?? "",
      bluetooth_device_name: thermal.bluetooth_device_name ?? "",
      auto_print: thermal.auto_print === true,
    },
    receipt: {
      enabled: receipt.enabled !== false,
      mode: receipt.mode ?? "browser",
      paper_width_mm: receipt.paper_width_mm === 80 ? 80 : 58,
      printer_name: receipt.printer_name ?? "",
      auto_print: receipt.auto_print === true,
    },
    camera: {
      provider: camera.provider && camera.provider !== "browser" ? "bridge" : "browser",
      preferred_device_id: camera.preferred_device_id ?? "",
      countdown_seconds: num(camera.countdown_seconds, 3),
      capture_width: num(camera.capture_width, 1920),
      capture_height: num(camera.capture_height, 1080),
      mirror_preview: camera.mirror_preview !== false,
      screen_orientation: camera.screen_orientation === "portrait" ? "portrait" : "landscape",
    },
    session: {
      auto_capture: photobox.session_settings.auto_capture === true,
    },
  };

  const lastTest =
    photobox.device_status && typeof photobox.device_status.printer === "object"
      ? (photobox.device_status.printer as {
          confirmed?: boolean;
          last_test_at?: string;
          mode?: string;
          device_name?: string;
        })
      : null;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 md:p-10">
      <Link
        href="/dashboard/photoboxes"
        className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })}
      >
        <ArrowLeft className="size-4" aria-hidden /> Photobox
      </Link>
      <PageHeader
        eyebrow={`HARDWARE · ${photobox.name.toUpperCase()}`}
        title="Printer, Kamera & Sesi"
        description={`Setelan mesin dan sesi booth ${str(photobox.name, "ini")}. Nilai di sini menimpa setelan booth secara global; panel PIN di booth tetap bisa mengubah setelan yang sama secara lokal.`}
        meta={`/p/${active.business.slug}/${photobox.slug} · ${photobox.status.toUpperCase()}`}
      />
      <PhotoboxHardwarePanel
        photoboxId={photobox.id}
        photoboxName={photobox.name}
        initial={initial}
        templates={templates.map((template) => ({
          id: template.id,
          name: template.name,
          is_global: template.is_global,
        }))}
        defaultTemplateId={photobox.default_template_id}
        printSettings={photobox.print_settings}
        lastTest={lastTest}
        canWrite={canWrite}
      />
    </div>
  );
}
