import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { KioskBrandingEditor } from "@/components/dashboard/KioskBrandingEditor";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { getBranding } from "@/server/branding";
import { listPhotoboxes } from "@/server/photoboxes";

export const metadata: Metadata = {
  title: "Branding & Kiosk | SnapyOS",
};

/** /dashboard/branding — single source of truth kustomisasi kiosk (Branding & Kiosk). */
export default async function BrandingKioskPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const canWrite = can(active.role, "business:update");

  let branding: Awaited<ReturnType<typeof getBranding>> | null = null;
  try {
    branding = await getBranding(user.id, active.business.id);
  } catch {
    branding = null;
  }

  const photoboxes = await listPhotoboxes(user.id, active.business.id);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 md:p-10">
      <PageHeader
        eyebrow="BRANDING: KUSTOMISASI KIOSK"
        title="Branding & Kiosk"
        description="Satu halaman untuk seluruh tampilan kiosk customer: warna, tipografi, teks tiap layar, tombol, dan video background attract screen. Konfigurasi global berlaku untuk semua booth; tiap booth bisa override sebagian/seluruh tampilannya sendiri."
      />

      <KioskBrandingEditor
        businessName={active.business.name}
        branding={
          branding
            ? {
                welcome_title: branding.welcome_title,
                welcome_tagline: branding.welcome_tagline,
                welcome_button: branding.welcome_button,
                primary_color: branding.primary_color,
                secondary_color: branding.secondary_color,
                logo_url: branding.logo_url,
                kiosk: { ...branding.kiosk, video_url: branding.kiosk_video_url },
              }
            : null
        }
        photoboxes={photoboxes.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          branding: p.branding,
        }))}
        canWrite={canWrite}
      />
    </div>
  );
}
