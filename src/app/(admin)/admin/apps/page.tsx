import { AdminActionButton, AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { BrutalistCheckbox } from "@/components/admin/BrutalistCheckbox";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createAppReleaseAction,
  deleteAppReleaseAction,
  toggleAppReleaseAction,
  updateAppReleaseAction,
} from "@/server/admin-actions";
import { listAppReleases, type AdminAppReleaseRow } from "@/server/admin";
import { PageHeader } from "@/components/ui/page-header";

/**
 * Admin Katalog Aplikasi, docs/10 §10.7 (migration 0081).
 * Yang disimpan hanya TAUTAN: file installer diunggah admin ke Google Drive,
 * tidak pernah melewati storage SNAPY OS.
 */

/** Host tujuan, supaya admin tahu tautan mengarah ke mana sebelum diklik. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Byte → label MB; null tidak pernah dipanggil (UI menyembunyikan, bukan "?"). */
function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const value = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)} MB`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(iso));
}

export default async function AdminAppsPage() {
  const releases = await listAppReleases();

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow="ADMIN - KATALOG APLIKASI"
        title="Katalog Aplikasi"
        meta={`${releases.length} rilis terdaftar · tautan unduhan saja`}
      />

      {/* Batas jujur: tanpa kalimat ini owner mengira integritas file dijamin platform. */}
      <div className="border-2 border-ink bg-accent/30 p-4 md:p-5">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.12em]">
          Batas tautan eksternal
        </p>
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed">
          File diunduh dari host di luar SNAPY OS. Ukuran dan SHA-256 diisi manual oleh admin dan
          tidak diverifikasi sistem. Periksa hash di booth dengan{" "}
          <code className="border border-ink/30 bg-surface px-1 font-mono text-xs">
            Get-FileHash
          </code>{" "}
          sebelum memasang.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daftarkan Rilis Baru</CardTitle>
          <CardDescription>
            Unggah file ke Google Drive, atur akses &quot;siapa saja yang punya link&quot;, lalu
            tempel tautannya di sini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminActionForm
            action={createAppReleaseAction}
            submitLabel="Daftarkan Rilis"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <div className="flex flex-col gap-1">
              <label
                htmlFor="release-version"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Versi (1.2.3)
              </label>
              <Input id="release-version" name="version" placeholder="1.0.0" required />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="release-file-name"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Nama file
              </label>
              <Input
                id="release-file-name"
                name="file_name"
                placeholder="snapyos-booth-1.0.0-setup.exe"
                required
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label
                htmlFor="release-url"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                URL unduhan (https://)
              </label>
              <Input
                id="release-url"
                name="download_url"
                type="url"
                placeholder="https://drive.google.com/file/d/..."
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="release-size"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Ukuran (byte, opsional)
              </label>
              <Input
                id="release-size"
                name="file_size_bytes"
                type="number"
                min={1}
                placeholder="104857600"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="release-sha"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                SHA-256 (opsional)
              </label>
              <Input
                id="release-sha"
                name="sha256"
                placeholder="64 karakter hex"
                spellCheck={false}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label
                htmlFor="release-notes"
                className="font-mono text-[11px] uppercase tracking-[0.12em]"
              >
                Catatan rilis (opsional)
              </label>
              <Textarea
                id="release-notes"
                name="release_notes"
                rows={3}
                placeholder="Perbaikan printer Bluetooth, dukungan kamera DSLR."
              />
            </div>
          </AdminActionForm>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {releases.length === 0 ? (
          <AdminEmptyState heading="BELUM ADA RILIS">
            Daftarkan rilis pertama di atas. Owner melihat rilis aktif di dashboard mereka.
          </AdminEmptyState>
        ) : (
          releases.map((r) => <ReleaseRow key={r.id} release={r} />)
        )}
      </div>
    </div>
  );
}

function ReleaseRow({ release: r }: { release: AdminAppReleaseRow }) {
  return (
    <div className="border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_#111111]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-3">
            <span className="font-display text-lg uppercase tracking-tight">v{r.version}</span>
            <StatusBadge status={r.is_active ? "active" : "inactive"} />
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {r.file_name}
            {r.file_size_bytes !== null ? ` · ${formatBytes(r.file_size_bytes)}` : ""}
            {" · "}
            {formatDate(r.created_at)}
          </span>
          <a
            href={r.download_url}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit break-all font-mono text-xs underline decoration-2 underline-offset-2 hover:bg-accent"
          >
            {hostOf(r.download_url)}
          </a>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <AdminActionButton
            action={toggleAppReleaseAction}
            hidden={{ releaseId: r.id, active: r.is_active ? "false" : "true" }}
            submitLabel={r.is_active ? "Nonaktifkan" : "Aktifkan"}
            variant={r.is_active ? "outline" : "secondary"}
          />
          <AdminActionButton
            action={deleteAppReleaseAction}
            hidden={{ releaseId: r.id }}
            submitLabel="Hapus"
            variant="ghost"
            confirm={`Hapus rilis v${r.version} dari katalog? File di host eksternal tidak ikut terhapus.`}
          />
        </span>
      </div>

      {r.sha256 ? (
        <p className="mt-3 break-all font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
          sha256 {r.sha256}
        </p>
      ) : null}

      <details className="mt-4 border-t-2 border-ink/10 pt-3">
        <summary className="cursor-pointer font-mono text-xs uppercase tracking-[0.12em]">
          Ubah rilis
        </summary>
        <AdminActionForm
          action={updateAppReleaseAction}
          hidden={{ releaseId: r.id }}
          submitLabel="Simpan"
          className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`version-${r.id}`}
              className="font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              Versi
            </label>
            <Input id={`version-${r.id}`} name="version" defaultValue={r.version} required />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`file-${r.id}`}
              className="font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              Nama file
            </label>
            <Input id={`file-${r.id}`} name="file_name" defaultValue={r.file_name} required />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label
              htmlFor={`url-${r.id}`}
              className="font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              URL unduhan (https://)
            </label>
            <Input
              id={`url-${r.id}`}
              name="download_url"
              type="url"
              defaultValue={r.download_url}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`size-${r.id}`}
              className="font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              Ukuran (byte)
            </label>
            <Input
              id={`size-${r.id}`}
              name="file_size_bytes"
              type="number"
              min={1}
              defaultValue={r.file_size_bytes ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor={`sha-${r.id}`}
              className="font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              SHA-256
            </label>
            <Input
              id={`sha-${r.id}`}
              name="sha256"
              defaultValue={r.sha256 ?? ""}
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <label
              htmlFor={`notes-${r.id}`}
              className="font-mono text-[11px] uppercase tracking-[0.12em]"
            >
              Catatan rilis
            </label>
            <Textarea
              id={`notes-${r.id}`}
              name="release_notes"
              rows={3}
              defaultValue={r.release_notes ?? ""}
            />
          </div>
          <BrutalistCheckbox
            name="is_active"
            label="Aktif"
            description="Hanya rilis aktif yang muncul di dashboard owner."
            defaultChecked={r.is_active}
            wrapperClassName="sm:col-span-2"
          />
        </AdminActionForm>
      </details>
    </div>
  );
}
