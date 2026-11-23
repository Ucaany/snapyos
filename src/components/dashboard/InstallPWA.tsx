"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { getDeviceProfile } from "@/lib/device-profile";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Install PWA prompt — muncul di dashboard owner bila perangkat memenuhi
 * kriteria instalabilitas (Android/desktop Chrome) dan belum terpasang.
 * iOS (iPad/iPhone) tidak punya beforeinstallprompt — tampilkan panduan
 * manual Share → Add to Home Screen bila belum standalone.
 * Tampil sekali per sesi (dismiss → tidak muncul lagi sampai reload).
 */
export function InstallPWA() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  const onBeforeInstall = useCallback((e: Event) => {
    e.preventDefault();
    setDeferred(e as BeforeInstallPromptEvent);
  }, []);

  useEffect(() => {
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [onBeforeInstall]);

  if (!mounted || dismissed || installed) return null;

  const profile = getDeviceProfile();
  const showIosGuide = !deferred && profile.isIos && !profile.isPwaInstalled;
  if (!deferred && !showIosGuide && !error) return null;

  async function install() {
    const ev = deferred;
    if (!ev) return;
    setPending(true);
    setError(null);
    setDeferred(null);
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      else setDeferred(ev);
    } catch {
      setDeferred(ev);
      setError("Instalasi gagal. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-2 border-ink bg-accent/20 p-4 shadow-hard">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {"PASANG APLIKASI"}
          </p>
          <p className="text-sm font-bold leading-tight">
            {showIosGuide
              ? "iPad/iPhone: buka menu Bagikan di Safari, lalu pilih Tambahkan ke Layar Utama agar kiosk jalan tanpa address bar."
              : "Pasang SnapyOS sebagai aplikasi kiosk di perangkat ini, tanpa App Store, tanpa install file. Buka dari layar utama, fullscreen."}
          </p>
        </div>
        <IconButton
          label="Tutup"
          variant="ghost"
          compact
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </IconButton>
      </div>
      {showIosGuide ? null : (
        <Button size="sm" className="self-start" disabled={pending} onClick={() => void install()}>
          <Download className="size-4" aria-hidden /> Pasang Aplikasi
        </Button>
      )}
      {error && <p role="alert" className="font-mono text-xs text-destructive">{error}</p>}
    </div>
  );
}
