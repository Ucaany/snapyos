"use client";

import type { CSSProperties, ReactNode } from "react";
import { kioskThemeVars, type KioskBrandingConfig } from "@/lib/kiosk-types";
import {
  getKioskScreenDefinition,
  resolveKioskScreenConfig,
  type KioskOrientation,
  type KioskScreenConfig,
  type KioskScreenId,
  type KioskScreenState,
} from "@/lib/kiosk-screen-registry";
import { cn } from "@/lib/utils";
import { KioskAction, KioskEyebrow, KioskHeading, KioskLoading } from "@/components/kiosk/ui";
import type { CameraSettings } from "@/lib/kiosk-types";

export type KioskScreenRendererProps = {
  screen: KioskScreenId;
  kiosk?: KioskBrandingConfig;
  brand?: { primary?: string | null; secondary?: string | null };
  camera?: CameraSettings | null;
  orientation?: KioskOrientation | null;
  config?: KioskScreenConfig;
  state?: KioskScreenState;
  onRetry?: () => void;
  children?: ReactNode;
  className?: string;
  safeArea?: boolean;
};

function stateCopy(
  screen: KioskScreenId,
  state: KioskScreenState
): { eyebrow: string; title: string; detail: string } {
  if (state === "offline" || screen === "offline") {
    return {
      eyebrow: "KONEKSI TERPUTUS",
      title: "Booth tetap siap",
      detail: "Hubungkan kembali jaringan untuk melanjutkan sinkronisasi hasil.",
    };
  }
  if (state === "maintenance" || screen === "maintenance") {
    return {
      eyebrow: "PERAWATAN",
      title: "Booth sedang disiapkan",
      detail: "Coba lagi setelah petugas menyelesaikan perawatan.",
    };
  }
  if (state === "empty") {
    return {
      eyebrow: "BELUM TERSEDIA",
      title: "Belum ada pilihan",
      detail: "Petugas perlu menyiapkan konten booth ini.",
    };
  }
  if (state === "loading") {
    return { eyebrow: "MENYIAPKAN", title: "Sebentar", detail: "Layar sedang disiapkan." };
  }
  return {
    eyebrow: "GANGGUAN",
    title: "Coba lagi",
    detail: "Layanan booth sedang mengalami gangguan. Hubungi petugas jika masalah berlanjut.",
  };
}

function StateView({
  screen,
  state,
  onRetry,
  config,
}: Pick<KioskScreenRendererProps, "screen" | "state" | "onRetry"> & { config: KioskScreenConfig }) {
  const copy = stateCopy(screen, state ?? "error");
  if (state === "loading") {
    return (
      <div
        className="mx-auto flex w-full max-w-[640px] flex-col justify-center gap-6 p-6"
        aria-busy="true"
      >
        <KioskEyebrow>{copy.eyebrow}</KioskEyebrow>
        <KioskHeading scale={config.fontScale}>{copy.title}</KioskHeading>
        <KioskLoading label={copy.detail} rows={4} />
      </div>
    );
  }
  return (
    <div
      className="mx-auto flex w-full max-w-[640px] flex-col items-start justify-center gap-5 p-6"
      role={state === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <KioskEyebrow>{copy.eyebrow}</KioskEyebrow>
      <KioskHeading scale={config.fontScale}>{copy.title}</KioskHeading>
      <p className="max-w-[48ch] text-sm leading-relaxed opacity-80 md:text-base">{copy.detail}</p>
      {onRetry && state !== "maintenance" && (
        <KioskAction tone="primary" size="lg" kioskStyle={config} onClick={onRetry}>
          Coba lagi
        </KioskAction>
      )}
    </div>
  );
}

export function KioskScreenRenderer({
  screen,
  kiosk,
  brand,
  camera,
  orientation,
  config,
  state,
  onRetry,
  children,
  className,
  safeArea = true,
}: KioskScreenRendererProps) {
  const definition = getKioskScreenDefinition(screen);
  const baseConfig =
    config ?? resolveKioskScreenConfig({ screen, kiosk, brand, camera, orientation });
  const renderState = state ?? baseConfig.state;
  const stateScreen = renderState === "fallback" ? definition.fallback : screen;
  const stateDefinition = getKioskScreenDefinition(stateScreen);
  const resolved =
    renderState === "fallback"
      ? {
          ...baseConfig,
          screen: stateScreen,
          layout: stateDefinition.layout,
          state: renderState,
          isFallback: true,
        }
      : baseConfig;
  const stateContent =
    renderState !== "ready" ? (
      <StateView screen={stateScreen} state={renderState} onRetry={onRetry} config={resolved} />
    ) : (
      children
    );
  const style: CSSProperties = {
    ...kioskThemeVars(resolved),
    backgroundColor: resolved.bg,
    color: resolved.text,
    fontFamily: resolved.fontFamily,
    ...(safeArea
      ? {
          paddingTop: resolved.safeArea.top,
          paddingRight: resolved.safeArea.right,
          paddingBottom: resolved.safeArea.bottom,
          paddingLeft: resolved.safeArea.left,
        }
      : {}),
  };

  return (
    <main
      data-kiosk-screen={resolved.screen}
      data-kiosk-layout={resolved.layout}
      data-kiosk-orientation={resolved.orientation}
      data-kiosk-fallback={resolved.isFallback ? "true" : "false"}
      aria-label={stateDefinition.label}
      tabIndex={-1}
      className={cn("relative flex min-h-0 flex-1 overflow-hidden", className)}
      style={style}
    >
      {stateContent}
    </main>
  );
}
