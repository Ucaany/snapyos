import { PageShell } from "@/components/layout/PageShell";

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DeviceManagement } from "@/components/dashboard/DeviceManagement";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { getActiveBusinessForRoles, requireUser } from "@/lib/tenant";
import { listPhotoboxes } from "@/server/photoboxes";

export const metadata: Metadata = { title: "Perangkat | SnapyOS" };

export default async function DevicesPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusinessForRoles(user.id, ["owner", "manager"]);
  if (!active) redirect("/dashboard");

  const photoboxes = await listPhotoboxes(user.id, active.business.id);

  return (
    <PageShell>
      <PageHeader
        eyebrow="PERANGKAT · PAIRING · DIAGNOSTIK"
        title="Manajemen Perangkat"
        description="Hubungkan booth, cabut perangkat lama, pantau status kamera dan printer, cek versi aplikasi yang dilaporkan booth. Tampilan kiosk lama tetap dibaca runtime, tetapi tidak lagi diubah dari dashboard."
      />
      <DeviceManagement
        businessId={active.business.id}
        businessSlug={active.business.slug}
        photoboxes={photoboxes}
        canWrite={can(active.role, "photobox:write")}
      />
    </PageShell>
  );
}
