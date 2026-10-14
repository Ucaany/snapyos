"use client";

import { useCallback, useEffect, useState } from "react";
import { Frame } from "lucide-react";
import { apiGet } from "@/components/kiosk/api";
import type { KioskVisualStyle, PublicTemplate } from "@/lib/kiosk-types";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";

type Props = {
  packageId: string;
  businessSlug: string;
  onSelect: (template: PublicTemplate | null) => void;
  /** Gaya visual kustom (Branding & Kiosk) — warna/font/radius mengikuti. */
  kioskStyle?: KioskVisualStyle;
  titleText?: string;
  videoUrl?: string | null;
};

/** Choose Template/Frame — docs/05 §5.4 + docs/15 §5.5 (post-paid, slot-filtered).
 *  2-part kiosk layout: left = context/branding, right = template grid (scroll). */
export function TemplatePicker({ packageId, businessSlug, onSelect, kioskStyle, titleText, videoUrl = null }: Props) {
  const ks = kioskStyle;
  const [templates, setTemplates] = useState<PublicTemplate[]>([]);
  const [selected, setSelected] = useState<PublicTemplate | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadTemplates = useCallback(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    apiGet<PublicTemplate[]>(
      `/api/v1/public/${businessSlug}/templates?package=${encodeURIComponent(packageId)}`
    )
      .then((data) => {
        if (alive) setTemplates(data);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [packageId, businessSlug]);

  useEffect(() => {
    const timer = setTimeout(loadTemplates, 0);
    return () => clearTimeout(timer);
  }, [loadTemplates]);

  return (
    <div
      className="relative flex min-h-[100dvh] flex-col overflow-y-auto bg-bg lg:flex-row lg:overflow-hidden"
      style={ks ? { backgroundColor: ks.bg, color: ks.text } : undefined}
    >
      <KioskVideoBackground videoUrl={videoUrl} />
      {/* Left panel — context + instructions */}
      <div
        className={`relative z-10 flex shrink-0 flex-col justify-center gap-3 border-b-2 border-ink p-6 lg:w-[42%] lg:border-b-0 lg:border-r-2 lg:p-10 lg:gap-5 ${
          videoUrl ? "bg-transparent" : "bg-surface"
        }`}
        style={ks ? { paddingLeft: ks.padding, paddingRight: ks.padding } : undefined}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {"/// STEP 02 · PILIH FRAME"}
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
          <span className="inline-flex items-center gap-1.5 border-2 border-ink bg-accent-2/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]">
            <Frame className="size-3" aria-hidden /> {loading ? "Memuat..." : `${templates.length} frame`}
          </span>
        </div>
      </div>

      {/* Right panel — template grid (scrollable) */}
      <div className="flex flex-1 flex-col overflow-y-auto p-4 lg:p-8 lg:items-center">
        <div className="flex w-full max-w-[720px] flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-4">
          <button
            type="button"
            aria-pressed={selected === null}
            onClick={() => setSelected(null)}
            className="flex aspect-[3/4] flex-col items-center justify-center gap-3 border-2 border-ink bg-surface p-3 shadow-[4px_4px_0_0_#111111] transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-[2px]"
            style={ks ? { borderRadius: ks.radius } : undefined}
          >
            <Frame className="size-8" aria-hidden />
            <span className="font-mono text-xs font-bold uppercase tracking-[0.1em]">Tanpa frame</span>
          </button>

          {loading ? (
            <>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] animate-pulse border-2 border-ink bg-muted" aria-hidden />
              ))}
            </>
          ) : error ? (
            <div className="col-span-full flex flex-col items-start gap-3 border-2 border-destructive bg-destructive/10 p-5">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">Gagal memuat frame</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Periksa koneksi, lalu coba lagi.
              </p>
              <button type="button" onClick={loadTemplates} className="min-h-11 border-2 border-ink bg-accent px-4 py-2 font-mono text-xs font-bold uppercase shadow-[3px_3px_0_0_#111111]">
                Coba lagi
              </button>
            </div>
          ) : templates.length === 0 ? (
            <div className="col-span-full flex flex-col items-start gap-2 border-2 border-dashed border-ink/40 bg-muted p-5">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
                {"/// BELUM ADA FRAME UNTUK PAKET INI"}
              </p>
              <p className="max-w-[50ch] font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Owner perlu assign template ke package ini di dashboard (jumlah slot
                harus sama dengan jumlah foto package).
              </p>
            </div>
          ) : (
            templates.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={selected?.id === t.id}
                onClick={() => setSelected(t)}
                className="group relative aspect-[3/4] overflow-hidden border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111] transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:translate-y-[2px]"
                style={ks ? { borderRadius: ks.radius } : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.thumbnail_url || t.file_url}
                  alt={t.name}
                  className="h-full w-full object-cover"
                />
                {t.slot_count > 0 && (
                  <span className="absolute left-0 top-0 border-b-2 border-r-2 border-ink bg-accent-2 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em]">
                    {`${t.slot_count} FOTO`}
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 border-t-2 border-ink bg-bg px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em]">
                   {t.name}
                </span>
                {selected?.id === t.id && <span className="absolute inset-0 border-4 border-accent" aria-hidden />}
              </button>
            ))
          )}
          </div>

          {selected !== undefined && (
            <div className="grid gap-4 border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_#111111] md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="flex items-center gap-4">
                <div className="relative aspect-[3/4] w-24 shrink-0 overflow-hidden border-2 border-ink bg-muted">
                  {selected ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.file_url} alt={`Preview ${selected.name}`} className="h-full w-full object-cover" />
                  ) : <Frame className="absolute inset-0 m-auto size-8" aria-hidden />}
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Preview frame</p>
                  <p className="font-display text-xl uppercase leading-none">{selected?.name ?? "Tanpa frame"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Frame akan ikut di preview editor dan hasil akhir.</p>
                </div>
              </div>
              <button type="button" onClick={() => onSelect(selected)} className="min-h-11 border-2 border-ink bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-[0.1em] shadow-[3px_3px_0_0_#111111] transition-transform active:translate-y-[2px]">
                Gunakan frame
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
