"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Frame } from "lucide-react";
import { apiGet } from "@/components/kiosk/api";
import { kioskThemeVars, type KioskVisualStyle, type PublicTemplate } from "@/lib/kiosk-types";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";
import { preloadFrameAssets } from "@/components/kiosk/frame-preload";
import {
  SNAPSHOT_FRESH_MS,
  readTemplateSnapshot,
  writeTemplateSnapshot,
} from "@/components/kiosk/template-cache";
import { filterTemplatesForPackage, type Snapshot } from "@/lib/template-cache";
import {
  KioskAction,
  KioskChip,
  KioskEyebrow,
  KioskHeading,
  kioskGutter,
} from "@/components/kiosk/ui";

type Props = {
  packageId: string;
  packagePhotoCount?: number;
  packagePrintCount?: number;
  businessSlug: string;
  onSelect: (template: PublicTemplate | null) => void;
  /** Gaya visual kustom (Branding & Kiosk) — warna/font/radius mengikuti. */
  kioskStyle?: KioskVisualStyle;
  titleText?: string;
  videoUrl?: string | null;
};

/** Choose Template/Frame — docs/05 §5.4 + docs/15 §5.5 (post-paid). */
export function TemplatePicker({
  packageId,
  packagePhotoCount = 1,
  packagePrintCount = 0,
  businessSlug,
  onSelect,
  kioskStyle,
  titleText,
  videoUrl = null,
}: Props) {
  const ks = kioskStyle;
  const align = ks?.align ?? "left";
  const alignClass =
    align === "center"
      ? "items-center text-center"
      : align === "right"
        ? "items-end text-right"
        : "items-start text-left";
  const accentStyle = ks
    ? { backgroundColor: ks.accent, color: ks.accentText, borderRadius: ks.radius }
    : undefined;
  const gutter = kioskGutter(ks?.padding);
  // Snapshot dibaca SINKRON saat mount: render pertama tidak menunggu jaringan
  // dan tidak pernah menampilkan skeleton bila cache perangkat sudah terisi.
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() =>
    readTemplateSnapshot(businessSlug)
  );
  const [templates, setTemplates] = useState<PublicTemplate[]>(() =>
    snapshot ? filterTemplatesForPackage(snapshot.templates, packageId) : []
  );
  const [selected, setSelected] = useState<PublicTemplate | null | undefined>(undefined);
  const [loading, setLoading] = useState(templates.length === 0);
  const [error, setError] = useState(false);
  const [fromCache, setFromCache] = useState(false);

  // AbortController dimiliki effect — unmount / ganti paket membatalkan request
  // in-flight, bukan hanya timer (cegah set state setelah unmount / race paket).
  const abortRef = useRef<AbortController | null>(null);

  const loadTemplates = useCallback(
    (force = false) => {
      const snap = snapshot;
      const fresh = snap !== null && Date.now() - snap.fetchedAt < SNAPSHOT_FRESH_MS;
      if (!force && fresh) {
        // Snapshot masih segar: tidak ada request daftar tambahan.
        setLoading(false);
        setError(false);
        setTemplates(filterTemplatesForPackage(snap.templates, packageId));
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      setError(false);
      apiGet<PublicTemplate[]>(`/api/v1/public/${businessSlug}/templates`, ac.signal)
        .then((data) => {
          if (ac.signal.aborted) return;
          // Simpan daftar LENGKAP; filter paket hanya untuk tampilan.
          writeTemplateSnapshot(businessSlug, data);
          setSnapshot({ schema: 1, fetchedAt: Date.now(), templates: data });
          setTemplates(filterTemplatesForPackage(data, packageId));
          setFromCache(false);
        })
        .catch(() => {
          if (ac.signal.aborted) return;
          const cached = snapshot;
          if (cached) {
            // Offline/limit: tampilkan cache, bukan kartu error.
            setTemplates(filterTemplatesForPackage(cached.templates, packageId));
            setFromCache(true);
            setError(false);
          } else {
            setError(true);
          }
        })
        .finally(() => {
          if (!ac.signal.aborted) setLoading(false);
        });
    },
    [packageId, businessSlug, snapshot]
  );

  useEffect(() => {
    const timer = setTimeout(() => loadTemplates(false), 0);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [loadTemplates]);

  // Setelah grid tampil, preload frame penuh di waktu idle: editor tidak perlu
  // render PNG dingin saat customer menekan "Gunakan frame".
  useEffect(() => {
    if (templates.length === 0) return;
    const controller = new AbortController();
    const cancel = preloadFrameAssets(templates, controller.signal);
    return () => {
      controller.abort();
      cancel();
    };
  }, [templates]);

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden"
      style={ks ? { ...kioskThemeVars(ks), backgroundColor: ks.bg, color: ks.text } : undefined}
    >
      <KioskVideoBackground videoUrl={videoUrl} />

      {/* Panel kiri: konteks + status. Di layar sempit ikut mengalir di atas grid. */}
      <aside
        className="relative z-10 flex shrink-0 flex-col gap-4 border-b-2 border-ink/15 py-6 lg:w-[36%] lg:justify-center lg:overflow-y-auto lg:border-b-0 lg:border-r-2 lg:border-ink/15 lg:py-8"
        style={{ paddingLeft: gutter, paddingRight: gutter }}
      >
        <div className={`flex flex-col gap-2.5 ${alignClass}`}>
          <KioskEyebrow>{"LANGKAH 02 · PILIH FRAME"}</KioskEyebrow>
          <KioskHeading size="md" scale={ks?.fontScale ?? 1}>
            {titleText || "Pilih frame"}
          </KioskHeading>
          <p className="max-w-[44ch] text-sm leading-relaxed text-muted-foreground md:text-base">
            Setiap frame punya slot yang terisi otomatis oleh hasil foto. Pilih satu, atau lanjut
            tanpa frame.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <KioskChip style={{ borderRadius: ks?.radius ?? 0 }}>
            <Frame className="size-3" aria-hidden />
            {loading ? "Memuat..." : `${templates.length} frame`}
          </KioskChip>
          <KioskChip style={{ borderRadius: ks?.radius ?? 0 }}>Slot mengikuti frame</KioskChip>
          {fromCache && (
            <KioskChip style={{ borderRadius: ks?.radius ?? 0 }}>{"Dari cache"}</KioskChip>
          )}
        </div>
      </aside>

      {/* Panel kanan: grid frame (scroll sendiri). */}
      <div
        className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto py-6 lg:py-8"
        style={{ paddingLeft: gutter, paddingRight: gutter }}
      >
        <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5">
          <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:gap-4">
            <button
              type="button"
              aria-pressed={selected === null}
              onClick={() => setSelected(null)}
              className={`flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 border-2 p-3 transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-[2px] ${
                selected === null
                  ? "border-ink bg-accent shadow-hard"
                  : "border-ink/30 bg-surface shadow-hard"
              }`}
              style={{
                width: "min(100%, calc(min(52dvh, 460px) * 0.75))",
                borderRadius: ks?.radius ?? 0,
              }}
            >
              <Frame className="size-8" aria-hidden />
              <span className="font-display text-xs font-bold uppercase tracking-[-0.01em]">
                Tanpa frame
              </span>
            </button>

            {loading ? (
              <>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[3/4] animate-pulse border-2 border-ink/20 bg-muted"
                    style={{ borderRadius: ks?.radius ?? 0 }}
                    aria-hidden
                  />
                ))}
              </>
            ) : error ? (
              <div
                className="col-span-full flex flex-col items-start gap-3 border-2 border-destructive bg-destructive/10 p-5"
                style={{ borderRadius: ks?.radius ?? 0 }}
              >
                <KioskEyebrow className="text-ink">{"GAGAL MEMUAT FRAME"}</KioskEyebrow>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Periksa koneksi booth, lalu coba lagi.
                </p>
                <KioskAction
                  tone="primary"
                  size="md"
                  onClick={() => loadTemplates(true)}
                  style={accentStyle}
                >
                  Coba lagi
                </KioskAction>
              </div>
            ) : templates.length === 0 ? (
              <div
                className="col-span-full flex flex-col items-start gap-2 border-2 border-dashed border-ink/40 bg-muted p-5"
                style={{ borderRadius: ks?.radius ?? 0 }}
              >
                <KioskEyebrow className="text-ink">{"BELUM ADA FRAME UNTUK PAKET INI"}</KioskEyebrow>
                <p className="max-w-[54ch] text-sm leading-relaxed text-muted-foreground">
                  Owner perlu mengaktifkan minimal satu template di dashboard. Tanpa frame, hasil
                  tetap bisa diambil dengan kartu Tanpa frame.
                </p>
              </div>
            ) : (
              templates.map((t, index) => {
                // Kartu mengikuti rasio kanvas frame. Grid 3/4 memotong strip
                // 2x6 (1:3) dengan `object-cover`, jadi customer hanya melihat
                // sepertiga frame dan tidak bisa menilai bentuk aslinya.
                const cw = t.layout?.canvas.width ?? 3;
                const ch = t.layout?.canvas.height ?? 4;
                const active = selected?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected(t)}
                    className={`group relative mx-auto overflow-hidden border-2 bg-muted shadow-hard transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-[2px] ${
                      active ? "border-ink" : "border-ink/30 hover:border-ink"
                    }`}
                    // Lebar dibatasi lebar sel DAN tinggi kartu; `aspect-ratio`
                    // saja akan memaksa lebar penuh lalu memotong tinggi di strip.
                    style={{
                      aspectRatio: `${cw} / ${ch}`,
                      width: `min(100%, calc(min(52dvh, 460px) * ${cw / ch}))`,
                      borderRadius: ks?.radius ?? 0,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      // Thumbnail kecil (WebP 480px) — bukan frame penuh. Frame
                      // penuh di-preload terpisah setelah grid tampil.
                      src={t.thumbnail_url || t.file_url}
                      alt={t.name}
                      // Baris pertama di atas lipatan: eager agar grid tidak
                      // berkedip; sisanya lazy (biasanya sudah ada di SW cache).
                      loading={index < 6 ? "eager" : "lazy"}
                      decoding="async"
                      className="h-full w-full object-contain"
                    />
                    {t.slot_count > 0 && (
                      <span className="absolute left-0 top-0 border-b-2 border-r-2 border-ink bg-bg px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase leading-none tracking-[0.08em]">
                        {`${t.slot_count} FOTO`}
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 truncate border-t-2 border-ink bg-bg px-2 py-1 text-center font-display text-[11px] font-bold uppercase leading-tight tracking-[-0.01em]">
                      {t.name}
                    </span>
                    {active && (
                      <span
                        className="pointer-events-none absolute inset-0 border-4"
                        style={{ borderColor: ks?.accent ?? undefined }}
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {selected !== undefined && (
            <div
              className="grid gap-4 border-2 border-ink bg-surface p-4 shadow-hard md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              style={{ borderRadius: ks?.radius ?? 0 }}
            >
              <div className="flex min-w-0 items-center gap-4">
                <div
                  className="relative h-24 shrink-0 overflow-hidden border-2 border-ink bg-muted"
                  // Panel konfirmasi memakai tinggi tetap; lebar mengikuti rasio
                  // frame supaya strip 1:3 tidak tampil gepeng atau terpotong.
                  style={{
                    width: `calc(6rem * ${(selected?.layout?.canvas.width ?? 3) / (selected?.layout?.canvas.height ?? 4)})`,
                  }}
                >
                  {selected ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selected.file_url}
                      alt={`Preview ${selected.name}`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Frame className="absolute inset-0 m-auto size-8" aria-hidden />
                  )}
                </div>
                <div className="min-w-0">
                  <KioskEyebrow>{"FRAME TERPILIH"}</KioskEyebrow>
                  <p className="mt-1 truncate font-display text-lg font-bold uppercase leading-none tracking-[-0.02em]">
                    {selected?.name ?? "Tanpa frame"}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground md:text-sm">
                    {selected
                      ? `${selected.slot_count} foto akan diambil dari slot frame. ${packagePrintCount} cetak tetap mengikuti paket.`
                      : `${packagePhotoCount} foto mengikuti paket saat tanpa frame. ${packagePrintCount} cetak tetap mengikuti paket.`}
                  </p>
                </div>
              </div>
              <KioskAction
                tone="primary"
                size="lg"
                onClick={() => onSelect(selected)}
                className="w-full md:w-auto md:min-w-[180px]"
                style={accentStyle}
              >
                Gunakan frame
              </KioskAction>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
