"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MonitorSmartphone, RefreshCw, Download } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { PhotoboxRow } from "@/server/photoboxes";

const deviceRowSchema = z.object({
  id: z.string(),
  photobox_id: z.string(),
  photobox_name: z.string().nullable(),
  name: z.string().nullable(),
  status: z.string(),
  last_seen_at: z.string().nullable(),
  last_heartbeat_at: z.string().nullable(),
  diagnostics: z.record(z.string(), z.unknown()).nullable(),
  camera_config: z.record(z.string(), z.unknown()).nullable(),
  printer_config: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
});
type DeviceRow = z.infer<typeof deviceRowSchema>;

const deviceListResponse = z.object({ data: z.array(deviceRowSchema) });
const activationResponse = z.object({
  data: z.object({
    code: z.string(),
    expires_at: z.string(),
  }),
});
const errorResponse = z.object({ error: z.object({ message: z.string() }).partial() }).partial();

type Props = {
  businessId: string;
  businessSlug: string;
  photobox: PhotoboxRow;
  canWrite: boolean;
  pwaKioskEnabled?: boolean;
};

function remainingLabel(expiresAt: string, now: number): string {
  if (!now) return "\u2026";
  const ms = new Date(expiresAt).getTime() - now;
  if (Number.isNaN(ms) || ms <= 0) return "KEDALUWARSA";
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const parsed = errorResponse.safeParse(await res.json());
    return parsed.data?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * DeviceDialog — docs/05 §5.0 (owner: kode aktivasi + QR, daftar device,
 * revoke, ulangi setup) + device_status dari setup wizard (§5.0.1).
 * qrcode diimpor dinamis (dalam handler) supaya tidak masuk bundle first-load.
 */
export function DeviceDialog({
  businessId,
  businessSlug,
  photobox,
  canWrite,
  pwaKioskEnabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [activation, setActivation] = useState<{ code: string; expires_at: string } | null>(null);
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const res = await fetch(`/api/v1/business/${businessId}/devices`);
      if (!res.ok) throw new Error(await readErrorMessage(res, "Gagal memuat perangkat"));
      const parsed = deviceListResponse.safeParse(await res.json());
      if (!parsed.success) throw new Error("Response tidak valid");
      setDevices(parsed.data.data.filter((d) => d.photobox_id === photobox.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat perangkat");
    } finally {
      setLoadingDevices(false);
    }
  }, [businessId, photobox.id]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void loadDevices(), 0);
    return () => clearTimeout(t);
  }, [open, loadDevices]);

  // Countdown expiry kode aktivasi — hanya jalan saat dialog terbuka DAN ada
  // activation code aktif. Cleanup otomatis saat tutup.
  useEffect(() => {
    if (!open || !activation) return;
    // Prime `now` di frame berikutnya untuk hindari cascading render.
    const seed = requestAnimationFrame(() => setNow(Date.now()));
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelAnimationFrame(seed);
      clearInterval(id);
    };
  }, [open, activation]);

  async function generateCode() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/business/${businessId}/photoboxes/${photobox.id}/activation`
      );
      if (!res.ok) throw new Error(await readErrorMessage(res, "Gagal membuat kode"));
      const parsed = activationResponse.safeParse(await res.json());
      if (!parsed.success) throw new Error("Response aktivasi tidak valid");
      const data = parsed.data.data;
      setActivation(data);
      const url = `${window.location.origin}/p/${businessSlug}/${photobox.slug}?code=${data.code}`;
      const { default: QRCode } = await import("qrcode");
      const dataUrl = await QRCode.toDataURL(url, {
        width: 240,
        margin: 2,
        color: { dark: "#111111", light: "#ffffff" },
      });
      if (mountedRef.current) setQr(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat kode");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(deviceId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/business/${businessId}/devices/${deviceId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Gagal mencabut device"));
      await loadDevices();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencabut device");
    } finally {
      setBusy(false);
    }
  }

  /** Cabut semua device aktif photobox ini — Promise.all per ronde,
   * loop dengan data segar dari server (bukan state stale). */
  async function revokeAll() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      for (let round = 0; round < 10; round++) {
        const res = await fetch(`/api/v1/business/${businessId}/devices`);
        if (!res.ok) throw new Error(await readErrorMessage(res, "Gagal memuat perangkat"));
        const parsed = deviceListResponse.safeParse(await res.json());
        if (!parsed.success) throw new Error("Response tidak valid");
        const active = parsed.data.data.filter(
          (d) => d.status === "active" && d.photobox_id === photobox.id
        );
        if (active.length === 0) break;
        const results = await Promise.all(
          active.map((d) =>
            fetch(`/api/v1/business/${businessId}/devices/${d.id}`, {
              method: "DELETE",
            }).catch(() => null)
          )
        );
        const failed = results.find((r) => r && !r.ok);
        if (failed) {
          throw new Error(await readErrorMessage(failed, "Gagal mencabut device"));
        }
      }
      await loadDevices();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mencabut device");
      await loadDevices();
    } finally {
      setBusy(false);
    }
  }

  const expired = activation ? new Date(activation.expires_at).getTime() <= now : false;
  const hasActive = devices.some((d) => d.status === "active");

  const cameraStatus = photobox.device_status?.camera as
    { resolution?: string; error?: string | null } | undefined;
  const printerStatus = photobox.device_status?.printer as
    | {
        confirmed?: boolean;
        last_test_at?: string;
        mode?: string;
        job?: {
          status?: string;
          last_error?: string | null;
          queue_pending?: number;
          queue_retrying?: number;
          last_job_at?: string | null;
        } | null;
      }
    | undefined;

  // Laporan terakhir datang dari heartbeat device (last_seen_at), bukan push
  // dari cloud: belum ada kanal perintah cloud ke runtime.
  const reportedAt = devices.reduce<string | null>((latest, d) => {
    const candidate = d.last_heartbeat_at ?? d.last_seen_at;
    if (!candidate) return latest;
    if (!latest) return candidate;
    return new Date(candidate) > new Date(latest) ? candidate : latest;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="icon-compact"
            aria-label={`Perangkat ${photobox.name}`}
            title={`Perangkat ${photobox.name}`}
            className="relative after:absolute after:-inset-1"
          >
            <MonitorSmartphone className="size-4" aria-hidden />
          </Button>
        }
      />
      <DialogContent className="max-w-[720px]">
        <DialogTitle>
          <span className="block font-mono text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground">
            {`PERANGKAT: ${photobox.name.toUpperCase()}`}
          </span>
          Device pairing
        </DialogTitle>
        <DialogDescription className="sr-only">
          Manajemen perangkat dan kode aktivasi photobox
        </DialogDescription>
        <p className="font-mono text-xs text-muted-foreground">
          /p/{businessSlug}/{photobox.slug}
        </p>

        {pwaKioskEnabled && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-ink bg-accent/20 p-4">
            <div className="flex flex-col gap-1">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                {"UNDUH PWA: ANDROID / TABLET / IOS"}
              </p>
              <p className="text-sm font-bold leading-tight">
                Buka pairing di perangkat mobile lalu pasang sebagai aplikasi kiosk (Add to Home
                Screen) tanpa App Store.
              </p>
            </div>
            <Button
              size="sm"
              className="self-start"
              onClick={() => {
                const url = `${window.location.origin}/p/${businessSlug}/${photobox.slug}${
                  activation && !expired ? `?code=${activation.code}` : ""
                }`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              <Download className="size-4" aria-hidden /> Unduh PWA
            </Button>
          </div>
        )}

        {/* device_status dari setup wizard */}
        <div className="grid grid-cols-1 gap-3 border-2 border-ink bg-muted p-4 font-mono text-xs md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <p className="font-bold uppercase tracking-[0.12em]">Kamera</p>
            <p className="text-muted-foreground">
              {cameraStatus?.resolution
                ? `${cameraStatus.resolution}${cameraStatus.error ? ` - ${cameraStatus.error}` : ""}`
                : "Belum ada laporan (setup wizard belum jalan)"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-bold uppercase tracking-[0.12em]">Printer</p>
            <p className="text-muted-foreground">
              {printerStatus?.confirmed === true
                ? `Test print OK (${printerStatus.last_test_at ?? ""})`
                : "Belum dikonfirmasi"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-bold uppercase tracking-[0.12em]">Printer aktif</p>
            <p className="text-muted-foreground">
              {photobox.print_settings.printer_name || "Belum dilaporkan booth"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-bold uppercase tracking-[0.12em]">Ukuran kertas</p>
            <p className="text-muted-foreground">
              {photobox.print_settings.paper_size ?? "Belum dilaporkan booth"}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-bold uppercase tracking-[0.12em]">Jalur cetak</p>
            <p className="text-muted-foreground">
              {printerStatus?.mode ?? "Belum dilaporkan booth"}
            </p>
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <p className="font-bold uppercase tracking-[0.12em]">Antrean cetak</p>
            <p className="text-muted-foreground">
              {printerStatus?.job
                ? `${printerStatus.job.status ?? "—"} · menunggu ${printerStatus.job.queue_pending ?? 0} · gagal ${printerStatus.job.queue_retrying ?? 0}${printerStatus.job.last_error ? ` · ${printerStatus.job.last_error}` : ""}`
                : "Belum ada job cetak"}
            </p>
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <p className="font-bold uppercase tracking-[0.12em]">Dilaporkan</p>
            <p className="text-muted-foreground">
              {reportedAt
                ? new Date(reportedAt).toLocaleString("id-ID")
                : loadingDevices
                  ? "…"
                  : "Belum pernah dilaporkan"}
            </p>
          </div>
        </div>

        {/* kode aktivasi */}
        {canWrite && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
                Kode aktivasi (sekali pakai)
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void generateCode()}
                disabled={busy || hasActive}
              >
                <RefreshCw className="size-4" aria-hidden /> Buat kode
              </Button>
            </div>
            {hasActive ? (
              <p className="border-2 border-dashed border-ink/40 bg-muted px-4 py-3 font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
                {"DEVICE AKTIF TERHUBUNG - cabut dulu untuk memasang perangkat baru"}
              </p>
            ) : (
              activation && (
                <div className="flex flex-wrap items-center gap-6 border-2 border-ink bg-bg p-4">
                  <div className="flex flex-col gap-1">
                    <p
                      className={`font-mono text-4xl font-bold tracking-[0.2em] ${
                        expired ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {activation.code}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                      {expired
                        ? "Kedaluwarsa: buat kode baru"
                        : `Berlaku ${remainingLabel(activation.expires_at, now)}`}
                    </p>
                  </div>
                  {qr && !expired && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qr}
                      alt="QR aktivasi perangkat"
                      className="h-36 w-36 border-2 border-ink"
                    />
                  )}
                </div>
              )
            )}
          </div>
        )}

        {/* daftar device */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
              Device terpasang
            </p>
            {canWrite && devices.some((d) => d.status === "active") && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void revokeAll()}
                disabled={busy}
              >
                Ulangi setup
              </Button>
            )}
          </div>
          {loadingDevices ? (
            <Skeleton className="h-10 w-full border-2 border-ink" />
          ) : devices.length === 0 ? (
            <p className="border-2 border-dashed border-ink/40 bg-muted px-4 py-3 font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
              {"BELUM ADA DEVICE - buat kode lalu buka URL di perangkat kiosk"}
            </p>
          ) : (
            <ul className="divide-y-2 divide-ink/10 border-2 border-ink">
              {devices.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex flex-col gap-0.5 font-mono text-xs">
                    <p className="font-bold uppercase tracking-[0.05em]">
                      {`${d.name ?? "Kiosk"}${d.photobox_name ? ` - ${d.photobox_name}` : ""}`}
                    </p>
                    <p className="text-muted-foreground">
                      {`Terakhir aktif: ${(d.last_heartbeat_at ?? d.last_seen_at) ? new Date(d.last_heartbeat_at ?? d.last_seen_at ?? "").toLocaleString("id-ID") : "-"}`}
                    </p>
                    {d.diagnostics && <p className="text-muted-foreground">Diagnostik tersedia</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block border-2 border-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] ${
                        d.status === "active" ? "bg-accent-3" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {d.status}
                    </span>
                    {canWrite && d.status === "active" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => void revoke(d.id)}
                        disabled={busy}
                      >
                        Cabut
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
          >
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
