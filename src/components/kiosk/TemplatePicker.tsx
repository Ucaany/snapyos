"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Frame } from "lucide-react";
import { apiGet } from "@/components/kiosk/api";
import { kioskThemeVars, type KioskVisualStyle, type PublicTemplate } from "@/lib/kiosk-types";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";
import { preloadFrameAssets } from "@/components/kiosk/frame-preload";

type Props = {
  packageId: string;
  businessSlug: string;
  /** Jumlah foto paket — untuk pesan kosong yang menyebut angka slot. */
  photoCount: number;
  onSelect: (template: PublicTemplate | null) => void;
  /** Gaya visual kustom (Branding & Kiosk) — warna/font/radius mengikuti. */
  kioskStyle?: KioskVisualStyle;
  titleText?: string;
  videoUrl?: string | null;
};

/** Choose Template/Frame — docs/05 §5.4 + docs/15 §5.5 (post-paid, slot-filtered).
 *  2-part kiosk layout: left = context/branding, right = template grid (scroll). */
export function TemplatePicker({
  packageId,
  businessSlug,
  photoCount,
  onSelect,
  kioskStyle,
  titleText,
  videoUrl = null,
}: Props) {
  const ks = kioskStyle;
  const alignClass =
    ks?.align === "center"
      ? "items-center text-center"
      : ks?.align === "right"
        ? "items-end text-right"
        : "items-start text-left";
  const accentStyle = ks
    ? { backgroundColor: ks.accent, color: ks.accentText, borderRadius: ks.radius }
    : undefined;
  const [templates, setTemplates] = useState<PublicTemplate[]>([]);
  const [selected, setSelected] = useState<PublicTemplate | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // AbortController dimiliki effect — unmount / ganti paket membatalkan request
  // in-flight, bukan hanya timer (cegah set state setelah unmount / race paket).
  const abortRef = useRef<AbortController | null>(null);

  const loadTemplates = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(false);
    apiGet<PublicTemplate[]>(
      `/api/v1/public/${businessSlug}/templates?package=${encodeURIComponent(packageId)}`,
      ac.signal
    )
      .then((data) => {
        if (ac.signal.aborted) return;
        setTemplates(data);
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setError(true);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
  }, [packageId, businessSlug]);

  useEffect(() => {
    const timer = setTimeout(loadTemplates, 0);
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
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-bg lg:flex-row lg:overflow-hidden"
      style={ks ? { ...kioskThemeVars(ks), backgroundColor: ks.bg, color: ks.text } : undefined}
    >
      <KioskVideoBackground videoUrl={videoUrl} />
      {/* Left panel: context + instructions */}
      <div
        className={`relative z-10 flex shrink-0 flex-col justify-center gap-3 border-b-2 border-ink p-6 lg:w-[42%] lg:gap-5 lg:overflow-y-auto lg:border-b-0 lg:border-r-2 lg:p-8 ${
          videoUrl ? "bg-transparent" : "bg-surface"
        } ${alignClass}`}
        style={ks ? { paddingLeft: ks.padding, paddingRight: ks.padding } : undefined}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {"STEP 02 · PILIH FRAME"}
        </p>
        <h1
          className="font-display text-3xl uppercase leading-[0.9] tracking-tight md:text-5xl lg:text-6xl"
          style={ks ? { fontFamily: ks.fontFamily, fontSize: `${2 * ks.fontScale}rem` } : undefined}
        >
          {titleText || "Pilih frame"}
        </h1>
        <p className="max-w-[40ch] text-sm leading-relaxed text-muted-foreground md:text-base">
          Pilih frame foto. Setiap frame memiliki slot yang otomatis terisi hasil pengambilan foto.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 border-2 border-ink bg-accent-2/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
            style={ks ? { borderRadius: ks.radius } : undefined}
          >
            <Frame className="size-3" aria-hidden />{" "}
            {loading ? "Memuat..." : `${templates.length} frame`}
          </span>
        </div>
      </div>

      {/* Right panel: template grid (scrollable) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 lg:items-center lg:p-8">
        <div className="flex w-full max-w-[720px] flex-col gap-5">
          {/* Kartu "tanpa frame" setinggi kartu frame tertinggi di grid, jadi
              baris pertama tetap rata walau frame lain berbentuk strip. */}
          <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-3 lg:gap-4">
            <button
              type="button"
              aria-pressed={selected === null}
              onClick={() => setSelected(null)}
              className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 border-2 border-ink bg-surface p-3 shadow-[4px_4px_0_0_#111111] transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-[2px]"
              style={{
                width: "min(100%, calc(min(58vh, 520px) * 0.75))",
                ...(ks ? { borderRadius: ks.radius } : {}),
              }}
            >
              <Frame className="size-8" aria-hidden />
              <span className="font-mono text-xs font-bold uppercase tracking-[0.1em]">
                Tanpa frame
              </span>
            </button>

            {loading ? (
              <>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[3/4] animate-pulse border-2 border-ink bg-muted"
                    aria-hidden
                  />
                ))}
              </>
            ) : error ? (
              <div className="col-span-full flex flex-col items-start gap-3 border-2 border-destructive bg-destructive/10 p-5">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
                  Gagal memuat frame
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Periksa koneksi, lalu coba lagi.
                </p>
                <button
                  type="button"
                  onClick={loadTemplates}
                  className="min-h-11 border-2 border-ink bg-accent px-4 py-2 font-mono text-xs font-bold uppercase shadow-[3px_3px_0_0_#111111]"
                  style={accentStyle}
                >
                  Coba lagi
                </button>
              </div>
            ) : templates.length === 0 ? (
              <div className="col-span-full flex flex-col items-start gap-2 border-2 border-dashed border-ink/40 bg-muted p-5">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
                  {"BELUM ADA FRAME UNTUK PAKET INI"}
                </p>
                <p className="max-w-[50ch] font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Owner perlu mengaktifkan minimal satu template di dashboard. Paket ini memakai{" "}
                  {`${photoCount} foto`}; tanpa frame, hasil tetap bisa diambil dengan kartu Tanpa
                  frame.
                </p>
              </div>
            ) : (
              templates.map((t) => {
                // Kartu mengikuti rasio kanvas frame. Grid 3/4 memotong strip
                // 2x6 (1:3) dengan `object-cover`, jadi customer hanya melihat
                // sepertiga frame dan tidak bisa menilai bentuk aslinya.
                const cw = t.layout?.canvas.width ?? 3;
                const ch = t.layout?.canvas.height ?? 4;
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={selected?.id === t.id}
                    onClick={() => setSelected(t)}
                    className="group relative mx-auto overflow-hidden border-2 border-ink bg-muted shadow-[4px_4px_0_0_#111111] transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-[2px]"
                    // Lebar dibatasi lebar sel DAN tinggi kartu; `aspect-ratio`
                    // saja akan memaksa lebar penuh lalu memotong tinggi di strip.
                    style={{
                      aspectRatio: `${cw} / ${ch}`,
                      width: `min(100%, calc(min(58vh, 520px) * ${cw / ch}))`,
                      ...(ks ? { borderRadius: ks.radius } : {}),
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      // Thumbnail kecil (WebP 480px) — bukan frame penuh. Frame
                      // penuh di-preload terpisah setelah grid tampil.
                      src={t.thumbnail_url || t.file_url}
                      alt={t.name}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain"
                    />
                    {t.slot_count > 0 && (
                      <span className="absolute left-0 top-0 border-b-2 border-r-2 border-ink bg-accent-2 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em]">
                        {`${t.slot_count} FOTO`}
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 border-t-2 border-ink bg-bg px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]">
                      {t.name}
                    </span>
                    {selected?.id === t.id && (
                      <span className="absolute inset-0 border-4 border-accent" aria-hidden />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {selected !== undefined && (
            <div
              className="grid gap-4 border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_#111111] md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              style={ks ? { borderRadius: ks.radius } : undefined}
            >
              <div className="flex items-center gap-4">
                <div
                  className="relative h-28 shrink-0 overflow-hidden border-2 border-ink bg-muted"
                  // Panel konfirmasi memakai tinggi tetap; lebar mengikuti rasio
                  // frame supaya strip 1:3 tidak tampil gepeng atau terpotong.
                  style={{
                    width: `calc(7rem * ${(selected?.layout?.canvas.width ?? 3) / (selected?.layout?.canvas.height ?? 4)})`,
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
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    Preview frame
                  </p>
                  <p className="font-display text-xl uppercase leading-none">
                    {selected?.name ?? "Tanpa frame"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Frame akan ikut di preview editor dan hasil akhir.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelect(selected)}
                className="min-h-11 border-2 border-ink bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.1em] shadow-[3px_3px_0_0_#111111] transition-transform active:translate-y-[2px]"
                style={accentStyle}
              >
                Gunakan frame
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
