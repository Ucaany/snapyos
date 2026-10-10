"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  if (!deferred && !showIosGuide) return null;

  async function install() {
    const ev = deferred;
    if (!ev) return;
    setDeferred(null);
    await ev.prompt();
    const choice = await ev.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
  }

  return (
    <div className="flex flex-col gap-3 border-2 border-ink bg-accent/20 p-4 shadow-[4px_4px_0_0_#111111]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            {"/// INSTALL PWA"}
          </p>
          <p className="text-sm font-bold leading-tight">
            {showIosGuide
              ? "iPad/iPhone: buka menu Share di Safari → Add to Home Screen agar kiosk jalan tanpa address bar."
              : "Pasang SnapyOS sebagai aplikasi kiosk di perangkat ini — tanpa App Store, tanpa install file. Buka dari layar utama, fullscreen."}
          </p>
        </div>
        <button
          type="button"
          aria-label="Tutup"
          onClick={() => setDismissed(true)}
          className="relative shrink-0 text-muted-foreground after:absolute after:-inset-3 hover:text-ink"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {showIosGuide ? null : (
        <Button size="sm" className="self-start" onClick={() => void install()}>
          <Download className="size-4" aria-hidden /> Pasang Aplikasi
        </Button>
      )}
    </div>
  );
}
