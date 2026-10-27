import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppDownloadCard } from "@/components/dashboard/AppDownloadCard";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/rbac";
import { formatReleaseDate, hostOf, needsAppUpdate, type AppReleaseView } from "@/lib/app-release";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listOwnerReleases } from "@/server/app-releases";
import { listPhotoboxes } from "@/server/photoboxes";

export const metadata: Metadata = { title: "Aplikasi Booth | SnapyOS" };

/**
 * /dashboard/apps: unduh aplikasi booth (Phase 12).
 *
 * Hanya tautan: installer diunggah admin ke Google Drive. Tidak ada tombol
 * "kirim update ke booth" karena belum ada kanal perintah cloud → runtime;
 * pembaruan dipasang manual di booth.
 */
export default async function AppsPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");
  if (!can(active.role, "photobox:read")) redirect("/dashboard");

  const [releases, photoboxes] = await Promise.all([
    listOwnerReleases(),
    listPhotoboxes(user.id, active.business.id),
  ]);
  // Rilis aktif terbaru = elemen pertama; getLatestRelease() memakai aturan yang
  // sama, jadi halaman cukup satu query.
  const latest = releases[0] ?? null;

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow="APLIKASI BOOTH"
        title="Aplikasi Booth"
        description="Installer aplikasi booth (Windows) diunduh dari tautan admin, lalu dipasang manual di komputer booth. SNAPY OS tidak menyimpan file installer."
      />

      {latest ? (
        <AppDownloadCard release={latest} />
      ) : (
        <EmptyState
          eyebrow="BELUM ADA RILIS"
          title="Belum ada rilis aktif"
          body="Admin belum mengaktifkan rilis aplikasi. Booth yang sudah terpasang tetap berjalan; hubungi admin bila butuh installer."
        />
      )}

      <BoothVersions photoboxes={photoboxes} latest={latest} />

      {releases.length > 1 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Riwayat rilis
          </h2>
          <ul className="flex flex-col divide-y-2 divide-ink/10 border-2 border-ink bg-surface">
            {releases.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
                <span className="font-mono text-sm font-bold">v{r.version}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {formatReleaseDate(r.created_at)}
                </span>
                <a
                  href={r.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs underline decoration-2 underline-offset-2 hover:bg-accent"
                >
                  {hostOf(r.download_url)}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

type BoothRow = {
  id: string;
  name: string;
  device_status: Record<string, unknown> | null;
};

function BoothVersions({
  photoboxes,
  latest,
}: {
  photoboxes: BoothRow[];
  latest: AppReleaseView | null;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
        Versi terpasang per booth
      </h2>
      {photoboxes.length === 0 ? (
        <p className="border-2 border-ink bg-muted p-4 text-sm text-muted-foreground">
          Belum ada booth terdaftar.
        </p>
      ) : (
        <div className="overflow-x-auto border-2 border-ink bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-ink text-left font-mono text-[10px] uppercase tracking-[0.12em]">
                <th className="px-4 py-2 font-bold">Booth</th>
                <th className="px-4 py-2 font-bold">Versi dilaporkan</th>
              </tr>
            </thead>
            <tbody>
              {photoboxes.map((p) => {
                const reported =
                  typeof p.device_status?.app_version === "string"
                    ? p.device_status.app_version
                    : null;
                const outdated = latest ? needsAppUpdate(reported, latest.version) : false;
                return (
                  <tr key={p.id} className="border-b-2 border-ink/10 last:border-b-0">
                    <td className="px-4 py-3">{p.name}</td>
                    <td className="px-4 py-3 font-mono text-xs [&>span]:ml-2">
                      {reported ? (
                        <>v{reported}</>
                      ) : (
                        <span className="text-muted-foreground">Belum pernah dilaporkan</span>
                      )}
                      {outdated ? (
                        <span className="inline-flex items-center border-2 border-ink bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]">
                          Perlu diperbarui
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
        Versi berasal dari laporan terakhir booth. Booth yang belum pernah melapor tidak bisa
        dibedakan dari booth yang sudah terbaru, jadi periksa langsung di komputernya. Pembaruan
        dipasang manual; tidak ada tombol kirim update dari dashboard.
      </p>
    </section>
  );
}
