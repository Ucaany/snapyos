import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PackagesTable } from "@/components/dashboard/PackagesTable";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listPackages } from "@/server/packages";
import { listTemplates } from "@/server/templates";
import { listOutlets } from "@/server/outlets";
import { listPhotoboxes } from "@/server/photoboxes";

export const metadata: Metadata = {
  title: "Paket | SnapyOS",
};

/** /dashboard/packages — CRUD package (docs/04 §4.9). */
export default async function PackagesPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const canWrite = can(active.role, "package:write");

  const [packages, templates, outlets, photoboxes] = await Promise.all([
    listPackages(user.id, active.business.id),
    listTemplates(user.id, active.business.id),
    listOutlets(user.id, active.business.id),
    listPhotoboxes(user.id, active.business.id),
  ]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 md:p-10">
      <PageHeader
        eyebrow={`PAKET: ${active.role.toUpperCase()}`}
        title="Paket"
        description="Paket menentukan harga dan jumlah foto/cetak di kiosk. Template tidak perlu di-assign: semua template aktif otomatis tersedia di setiap paket. Harga integer IDR; final amount saat checkout selalu dihitung server-side."
      />

      <PackagesTable
        packages={packages}
        templateCount={templates.length}
        outlets={outlets.map((o) => ({ id: o.id, name: o.name }))}
        photoboxes={photoboxes.map((b) => ({ id: b.id, name: b.name }))}
        canWrite={canWrite}
      />
    </div>
  );
}
