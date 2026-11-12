"use client";

import { useState } from "react";

import { KioskScreenRenderer } from "@/components/kiosk/KioskScreenRenderer";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";
import { KioskAction, KioskCard } from "@/components/kiosk/ui";
import { WelcomeScreen } from "@/components/kiosk/WelcomeScreen";
import { Select } from "@/components/ui/select";
import type { BrandingConfig, KioskPageId } from "@/lib/kiosk-types";
import type { KioskScreenId } from "@/lib/kiosk-screen-registry";

const PAGE_LABELS: { id: KioskPageId; label: string; screen: KioskScreenId }[] = [
  { id: "welcome", label: "Beranda", screen: "welcome" },
  { id: "guide", label: "Petunjuk", screen: "guide" },
  { id: "package", label: "Paket", screen: "package" },
  { id: "payment", label: "Pembayaran", screen: "payment" },
  { id: "template", label: "Frame", screen: "template" },
  { id: "capture", label: "Ambil foto", screen: "capture" },
  { id: "edit", label: "Edit", screen: "editor" },
  { id: "result", label: "Hasil", screen: "result" },
];

const MOCK: Record<KioskPageId, { title: string; body: string }> = {
  welcome: { title: "Selamat datang", body: "Tekan mulai untuk memilih paket foto." },
  guide: { title: "Cara pakai", body: "Pilih paket, ambil foto, lalu edit dan cetak." },
  package: { title: "Pilih paket", body: "Tiga paket tersedia untuk sesi ini." },
  payment: { title: "Pembayaran", body: "Pindai QRIS atau bayar tunai di kasir." },
  template: { title: "Pilih frame", body: "Ketuk frame yang ingin dipakai." },
  capture: { title: "Ambil foto", body: "Bersiap, hitungan mundur dimulai." },
  edit: { title: "Edit foto", body: "Atur filter, zoom, dan stiker." },
  result: { title: "Hasil siap", body: "Pindai QR untuk mengunduh hasil." },
};

/**
 * Judul & hint yang dipakai kiosk asli per layar. Salinan fallback-nya harus
 * sama supaya pratinjau tidak berbohong saat owner mengedit teks per layar.
 */
function pageCopy(branding: BrandingConfig, page: KioskPageId) {
  const k = branding.kiosk ?? {};
  const mock = MOCK[page];
  switch (page) {
    case "guide":
      return { title: k.guide_title || mock.title, body: mock.body };
    case "package":
      return { title: k.package_title || mock.title, body: mock.body };
    case "payment":
      return { title: k.payment_title || mock.title, body: k.payment_hint || mock.body };
    case "template":
      return { title: k.template_title || mock.title, body: mock.body };
    case "capture":
      return { title: k.capture_title || mock.title, body: k.capture_hint || mock.body };
    case "edit":
      return { title: k.editor_title || mock.title, body: k.editor_hint || mock.body };
    case "result":
      return { title: k.result_title || mock.title, body: k.result_hint || mock.body };
    default:
      return mock;
  }
}

function MockScreen({ page, copy }: { page: KioskPageId; copy: { title: string; body: string } }) {
  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col justify-center gap-4 p-5">
      <p className="font-mono text-[10px] font-bold uppercase leading-none tracking-[0.24em] opacity-60">
        PRATINJAU · {page.toUpperCase()}
      </p>
      <h2 className="font-display text-2xl font-black uppercase leading-none tracking-tight sm:text-3xl">
        {copy.title}
      </h2>
      <p className="max-w-[46ch] text-sm leading-relaxed opacity-80">{copy.body}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <KioskCard elevated className="p-4">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">
            PAKET A
          </p>
          <p className="mt-2 font-display text-xl font-bold uppercase">Cetak 2 lembar</p>
          <p className="mt-1 text-xs opacity-70">3 foto · digital</p>
        </KioskCard>
        <KioskCard className="p-4">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] opacity-60">
            PAKET B
          </p>
          <p className="mt-2 font-display text-xl font-bold uppercase">Cetak 4 lembar</p>
          <p className="mt-1 text-xs opacity-70">6 foto · digital</p>
        </KioskCard>
      </div>
      <KioskAction tone="primary" size="lg" className="mt-1 w-full sm:w-auto">
        Lanjut
      </KioskAction>
    </div>
  );
}

type Props = {
  businessName: string;
  branding: BrandingConfig;
};

/** Pratinjau in-page memakai komponen kiosk asli (bukan iframe). */
export function DesignBuilderPreview({ businessName, branding }: Props) {
  const [page, setPage] = useState<KioskPageId>("welcome");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const entry = PAGE_LABELS.find((item) => item.id === page) ?? PAGE_LABELS[0]!;
  const business = { name: businessName, logo_url: branding.logo_url ?? null };
  const videoUrl = branding.kiosk?.pages?.[page]?.video_url ?? null;
  const copy = pageCopy(branding, page);

  return (
    <section
      aria-labelledby="design-preview-heading"
      className="flex min-w-0 flex-col gap-3 border-2 border-ink bg-surface p-3 shadow-hard lg:sticky lg:top-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            PRATINJAU LANGSUNG
          </p>
          <h2
            id="design-preview-heading"
            className="font-display text-base font-bold uppercase leading-none tracking-tight"
          >
            Kiosk · {entry.label}
          </h2>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          {orientation === "portrait" ? "1080 × 1920" : "1920 × 1080"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Layar
          </span>
          <Select
            value={page}
            onChange={(event) => setPage(event.target.value as KioskPageId)}
            className="min-h-11 text-xs"
          >
            {PAGE_LABELS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Orientasi
          </span>
          <Select
            value={orientation}
            onChange={(event) =>
              setOrientation(event.target.value === "landscape" ? "landscape" : "portrait")
            }
            className="min-h-11 text-xs"
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </Select>
        </label>
      </div>

      <div className="flex justify-center bg-bg p-2">
        <div
          className={`relative w-full overflow-hidden border-2 border-ink ${
            orientation === "portrait"
              ? "aspect-[9/16] max-w-[300px]"
              : "aspect-[16/9] max-w-[560px]"
          }`}
        >
          <div className="absolute inset-0 flex flex-col overflow-hidden">
            {page === "welcome" ? (
              <WelcomeScreen business={business} branding={branding} onStart={() => undefined} />
            ) : (
              <KioskScreenRenderer
                screen={entry.screen}
                kiosk={branding.kiosk}
                brand={{
                  primary: branding.primary_color,
                  secondary: branding.secondary_color,
                }}
                orientation={orientation}
                className="flex-1"
              >
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <KioskVideoBackground videoUrl={videoUrl} />
                  <div className="relative z-10 flex min-h-0 flex-1 flex-col">
                    <MockScreen page={page} copy={copy} />
                  </div>
                </div>
              </KioskScreenRenderer>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
