import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BusinessProfileEditor } from "@/components/dashboard/BusinessProfileEditor";
import { CheckoutSettingsEditor } from "@/components/dashboard/CheckoutSettingsEditor";
import { OutputSettingsEditor } from "@/components/dashboard/OutputSettingsEditor";
import { PasswordChangeForm } from "@/components/dashboard/PasswordChangeForm";
import { RetentionSettingsEditor } from "@/components/dashboard/RetentionSettingsEditor";
import { StorageUsageCard } from "@/components/dashboard/StorageUsageCard";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { getActiveBusinessForRoles, requireUser } from "@/lib/tenant";
import { getBusinessProfile, getSettings } from "@/server/business";
import { getStorageUsage } from "@/server/storage-usage";

export const metadata: Metadata = {
  title: "Pengaturan | SnapyOS",
};

/**
 * /dashboard/settings — profil bisnis, storage, aturan & kebijakan website:
 * durasi QRIS, retensi hasil foto 1–3 hari. Kustomisasi tampilan kiosk
 * dikelola dari perangkat pairing dan runtime booth.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusinessForRoles(user.id, ["owner", "manager"]);
  if (!active) redirect("/dashboard");

  const canWrite = can(active.role, "business:update");

  let qrisExpiryMinutes: number | null = null;
  let retentionDays: number | null = null;
  let gifEnabled = true;
  let gifFrameDelayMs: number | null = null;
  let gifMaxWidth: number | null = null;
  try {
    const settings = await getSettings(user.id, active.business.id);
    qrisExpiryMinutes = settings.checkout?.qris_expiry_minutes ?? null;
    retentionDays = settings.retention_days ?? null;
    gifEnabled = settings.output?.gif?.enabled !== false;
    gifFrameDelayMs = settings.output?.gif?.frame_delay_ms ?? null;
    gifMaxWidth = settings.output?.gif?.max_width ?? null;
  } catch {
    qrisExpiryMinutes = null;
    retentionDays = null;
  }

  let profile = {
    name: active.business.name,
    whatsapp: null as string | null,
    owner_name: null as string | null,
    contact_email: null as string | null,
    address: null as string | null,
  };
  try {
    profile = await getBusinessProfile(user.id, active.business.id);
  } catch {
    // fallback name dari membership.
  }

  let storage = {
    usedBytes: 0,
    limitBytes: 0,
    usedMb: 0,
    limitMb: 0,
    remainingBytes: 0,
    remainingMb: 0,
    percent: 0,
    isFull: false,
  };
  try {
    storage = await getStorageUsage(active.business.id);
  } catch {
    // fail-open: tampilkan 0, tidak memblokir halaman.
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="PROFIL · PENYIMPANAN · PEMBAYARAN · MASA SIMPAN"
        title="Pengaturan"
        description="Profil bisnis, kuota penyimpanan, durasi kedaluwarsa QRIS, dan masa simpan hasil foto (1 sampai 3 hari). Pairing, status, versi, dan diagnostik perangkat ada di Manajemen Perangkat."
      />

      <div className="grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-2">
        <BusinessProfileEditor profile={profile} canWrite={canWrite} />
        <StorageUsageCard usage={storage} />
        <CheckoutSettingsEditor qrisExpiryMinutes={qrisExpiryMinutes} canWrite={canWrite} />
        <RetentionSettingsEditor retentionDays={retentionDays} canWrite={canWrite} />
        <OutputSettingsEditor
          gifEnabled={gifEnabled}
          frameDelayMs={gifFrameDelayMs}
          maxWidth={gifMaxWidth}
          canWrite={canWrite}
        />
        <PasswordChangeForm />
      </div>
    </PageShell>
  );
}
