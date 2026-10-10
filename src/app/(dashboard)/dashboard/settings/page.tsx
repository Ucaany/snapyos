import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BusinessProfileEditor } from "@/components/dashboard/BusinessProfileEditor";
import { CheckoutSettingsEditor } from "@/components/dashboard/CheckoutSettingsEditor";
import { RetentionSettingsEditor } from "@/components/dashboard/RetentionSettingsEditor";
import { StorageUsageCard } from "@/components/dashboard/StorageUsageCard";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { getBusinessProfile, getSettings } from "@/server/business";
import { getStorageUsage } from "@/server/storage-usage";

export const metadata: Metadata = {
  title: "Pengaturan — SnapyOS",
};

/**
 * /dashboard/settings — profil bisnis, storage, aturan & kebijakan website:
 * durasi QRIS, retensi hasil foto 1–3 hari. Kustomisasi tampilan kiosk
 * ada di /dashboard/branding (single source of truth).
 */
export default async function SettingsPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const canWrite = can(active.role, "business:update");

  let qrisExpiryMinutes: number | null = null;
  let retentionDays: number | null = null;
  try {
    const settings = await getSettings(user.id, active.business.id);
    qrisExpiryMinutes = settings.checkout?.qris_expiry_minutes ?? null;
    retentionDays = settings.retention_days ?? null;
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
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow="PENGATURAN — PROFIL, STORAGE & KEBIJAKAN"
        title="Pengaturan"
        description="Profil bisnis, kuota penyimpanan, durasi kedaluwarsa QRIS, dan masa simpan hasil foto (1–3 hari). Kustomisasi tampilan kiosk ada di Branding & Kiosk; chroma key template diatur dari menu Template."
        meta="[ 4 MODUL ] /// PROFIL · STORAGE · CHECKOUT · RETENTION"
      />

      <div className="grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-2">
        <BusinessProfileEditor profile={profile} canWrite={canWrite} />
        <StorageUsageCard usage={storage} />
        <CheckoutSettingsEditor qrisExpiryMinutes={qrisExpiryMinutes} canWrite={canWrite} />
        <RetentionSettingsEditor retentionDays={retentionDays} canWrite={canWrite} />
      </div>
    </div>
  );
}