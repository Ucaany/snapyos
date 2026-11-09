"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultBrandColors, slotColors } from "@/lib/brand-defaults";
import {
  FILTER_PRESETS,
  filterCss,
  kioskThemeVars,
  type CapturePhoto,
  type FinalPhoto,
  type KioskOverlay,
  type KioskVisualStyle,
  type PhotoEdit,
} from "@/lib/kiosk-types";
import {
  slotsByZ,
  type TemplateLayout,
} from "@/lib/template-layout";
import { fillSlots } from "@/lib/template-fit";
import { composeFrame } from "@/lib/compose-frame";
import {
  canvasToBlob,
  defaultEdit,
  drawFrameOverlay,
  drawOverlayLayer,
  drawPhoto,
  renderFramedPhotoBlob,
} from "@/components/kiosk/photo-render";
import { StickerPicker } from "@/components/kiosk/StickerPicker";
import { KioskVideoBackground } from "@/components/kiosk/KioskVideoBackground";
import { useObjectUrls } from "@/components/kiosk/use-object-url";

const TEXT_COLORS = [
  defaultBrandColors.ink,
  "white",
  defaultBrandColors.accent,
  slotColors[2],
  slotColors[1],
  slotColors[3],
] as const;
const POSITIONS = [
  { id: "top", label: "Atas", y: 0.25 },
  { id: "center", label: "Tengah", y: 0.5 },
  { id: "bottom", label: "Bawah", y: 0.75 },
];

type Props = {
  photos: CapturePhoto[];
  finishing: boolean;
  onFinish: (finalPhotos: FinalPhoto[]) => void;
  /** Filter awal (dipilih live di kamera) — berlaku per foto, bisa diubah. */
  initialFilterId?: string;
  /** Layout slot template terpilih — null = tanpa frame/tanpa slot (docs/15 §5.9). */
  layout?: TemplateLayout | null;
  frameUrl?: string | null;
  /** Teks kustom owner (Branding & Kiosk) — kosong = default. */
  titleText?: string;
  hintText?: string;
  /** Gaya visual kustom per layar — chrome header/panel mengikuti. */
  kioskStyle?: KioskVisualStyle;
  /** Izinkan customer zoom/pan foto (default true). */
  allowZoomPan?: boolean;
  /** Video promo layar edit (pages.edit.video_url). */
  videoUrl?: string | null;
  finishRequested?: boolean;
};

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `ov-${Date.now()}-${idSeq}`;
}

/** Signature nilai edit yang memengaruhi render (bukan identitas objek).
 *  JSON (bukan separator manual): teks overlay boleh mengandung `:`/`|`. */
function editSignature(e: PhotoEdit): string {
  const a = e.adjust;
  return JSON.stringify({
    filter: a.filter,
    rotation: a.rotation,
    zoom: a.zoom,
    panX: a.panX,
    panY: a.panY,
    brightness: a.brightness,
    contrast: a.contrast,
    saturation: a.saturation,
    blur: a.blur,
    grain: a.grain,
    vignette: a.vignette,
    overlays: e.overlays.map((o) => ({
      id: o.id,
      kind: o.kind,
      content: o.content,
      color: o.color,
      size: o.size,
      x: o.x,
      y: o.y,
      rotation: o.rotation,
    })),
  });
}

/** Photo Editor — docs/05 §5.9–5.11 (filter, zoom/pan, adjust, teks & stiker dasar). */
function EditorInner({
  photos,
  finishing,
  onFinish,
  initialFilterId = "original",
  layout = null,
  frameUrl = null,
  titleText,
  hintText,
  kioskStyle,
  allowZoomPan = true,
  videoUrl = null,
  finishRequested = false,
}: Props) {
  const [edits, setEdits] = useState<PhotoEdit[]>(() =>
    photos.map(() => {
      const base = defaultEdit();
      return { ...base, adjust: { ...base.adjust, filter: initialFilterId } };
    })
  );
  const [active, setActive] = useState(0);
  const [text, setText] = useState("");
  const [selectedOverlay, setSelectedOverlay] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Object URL ref-counted (StrictMode-safe) — createObjectURL manual di bawah
  // StrictMode me-revoke URL yang masih dipakai render kedua → ERR_FILE_NOT_FOUND.
  const photoUrls = useObjectUrls(photos.map((p) => p.blob));
  const imgsRef = useRef<(HTMLImageElement | null)[]>([]);
  const frameRef = useRef<HTMLImageElement | null>(null);
  const [imgVersion, setImgVersion] = useState(0);
  const [frameVersion, setFrameVersion] = useState(0);
  const [frameError, setFrameError] = useState(false);
  const dragging = useRef(false);
  const overlayDragging = useRef(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const lastOverlayPointer = useRef<{ x: number; y: number } | null>(null);
  const autoFinished = useRef(false);
  // Batch pan pointer: akumulasi delta di ref, flush SATU setState per frame
  // (rAF) — bukan 2 patchAdjust per pointermove seperti sebelumnya.
  const panAccum = useRef<{ x: number; y: number } | null>(null);
  const panRaf = useRef<number | null>(null);
  // Cache canvas offscreen per-slot: recomposite HANYA slot yang editnya
  // berubah (drag slot aktif tak me-render ulang slot lain tiap frame).
  const slotCacheRef = useRef<{ sig: string; canvas: HTMLCanvasElement }[]>([]);

  // `active` menunjuk SLOT; edit dimiliki FOTO. Pada frame 6 slot + 3 foto,
  // slot 4..6 memakai ulang foto 1..3, jadi keduanya harus dipetakan.
  const activePhoto = layout
    ? (fillSlots(layout.slots.length, photos.length)[active] ?? 0)
    : active;
  const edit = edits[activePhoto] ?? defaultEdit();
  // Overlay SEMUA foto dipetakan ke slot: satu composite memuat teks/stiker
  // tiap foto, bukan hanya foto yang sedang aktif.
  const usedPhotoIndices = Array.from(
    new Set(fillSlots(layout?.slots.length ?? 0, photos.length))
  );
  const slotOverlays = usedPhotoIndices.flatMap(
    (photoIndex) => edits[photoIndex]?.overlays ?? []
  );

  // load semua foto sekali (mode composite butuh semua slot terisi)
  useEffect(() => {
    // Tunggu URL ref-counted siap (state awal [] sebelum effect hook commit).
    if (photoUrls.length !== photos.length || photoUrls.some((u) => !u)) return;
    let cancelled = false;
    slotCacheRef.current = [];
    imgsRef.current = photos.map(() => null);
    void Promise.all(
      photoUrls.map(
        (url, i) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              if (!cancelled) imgsRef.current[i] = img;
              resolve();
            };
            img.onerror = () => resolve();
            img.src = url!;
          })
      )
    ).then(() => {
      if (!cancelled) setImgVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
      // Null-kan juga: ref yang tertinggal non-null membuat onPointerMove
      // mengira frame masih terjadwal → pan berhenti selamanya setelah
      // daftar foto berubah (efek ini jalan ulang tiap photos berubah).
      if (panRaf.current !== null) {
        cancelAnimationFrame(panRaf.current);
        panRaf.current = null;
      }
    };
  }, [photos, photoUrls]);

  // load frame PNG (signed URL). crossOrigin WAJIB: tanpa ini canvas jadi
  // tainted (gambar cross-origin) → export blob di finish() gagal dan hasil
  // cetak/foto final tidak pernah dihasilkan.
  useEffect(() => {
    if (!frameUrl) {
      frameRef.current = null;
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) {
        setFrameError(false);
        frameRef.current = img;
        setFrameVersion((v) => v + 1);
      }
    };
    img.onerror = () => {
      if (!cancelled) setFrameError(true);
    };
    img.src = frameUrl;
    return () => {
      cancelled = true;
    };
  }, [frameUrl]);

  /** Render per-foto untuk mode slot: filter/rotasi/overlay tetap jalan,
   *  zoom/pan dialihkan ke transform slot (docs/15 §5.9). */
  function slotBaseEdit(e: PhotoEdit): PhotoEdit {
    return { ...e, adjust: { ...e.adjust, zoom: 1, panX: 0, panY: 0 } };
  }

  /**
   * Offscreen per FOTO (bukan per slot) — cache key = indeks foto. Slot yang
   * lebih banyak dari foto memakai ulang offscreen yang sama, jadi frame 6
   * slot pada paket 3 foto tidak menggandakan kerja render.
   */
  function renderPhotoOffscreens(maxW: number): (HTMLCanvasElement | null)[] {
    const cache = slotCacheRef.current;
    return photos.map((_, i) => {
      const img = imgsRef.current[i];
      if (!img) return null;
      const base = slotBaseEdit(edits[i] ?? defaultEdit());
      // Signature: recomposite hanya bila edit/img/lebar berubah.
      const sig = JSON.stringify({ imgVersion, maxW, edit: editSignature(base) });
      const cached = cache[i];
      if (cached && cached.sig === sig) return cached.canvas;
      const off = document.createElement("canvas");
      drawPhoto(off, img, base, maxW);
      cache[i] = { sig, canvas: off };
      return off;
    });
  }

  /** Transform zoom/pan milik satu foto (dipakai tiap slot yang menampilkannya). */
  function transformsFor(photoIndex: number) {
    const e = edits[photoIndex] ?? defaultEdit();
    return { zoom: e.adjust.zoom, panX: e.adjust.panX, panY: e.adjust.panY };
  }

  /**
   * Sumber per slot: indeks foto mengikuti `fillSlots`. Slot ke-i memakai
   * foto `i % photos.length`, jadi slot berlebih terisi bergiliran.
   */
  function slotSources(maxW: number): (HTMLCanvasElement | null)[] {
    if (!layout) return renderPhotoOffscreens(maxW);
    const offscreens = renderPhotoOffscreens(maxW);
    return fillSlots(layout.slots.length, photos.length).map(
      (photoIndex) => offscreens[photoIndex] ?? null
    );
  }

  // redraw preview when image or edits change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (layout) {
      const sources = slotSources(640);
      composeFrame(
        canvas,
        layout,
        frameRef.current,
        sources,
        fillSlots(sources.length, photos.length).map((photoIndex) => transformsFor(photoIndex)),
        720,
        { overlays: slotOverlays }
      );
      // highlight slot aktif (petunjuk zoom/pan berlaku per slot). Urutan sama
      // dengan render (slotsByZ) agar indeks slot aktif tidak meleset.
      const ctx = canvas.getContext("2d");
      const slots = slotsByZ(layout);
      const slot = slots[active];
      if (ctx && slot) {
        const s = canvas.width / layout.canvas.width;
        ctx.save();
        ctx.translate((slot.x + slot.width / 2) * s, (slot.y + slot.height / 2) * s);
        ctx.rotate((slot.rotation * Math.PI) / 180);
        ctx.translate(-(slot.x + slot.width / 2) * s, -(slot.y + slot.height / 2) * s);
        ctx.strokeStyle = defaultBrandColors.destructive;
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 8]);
        ctx.strokeRect(slot.x * s, slot.y * s, slot.width * s, slot.height * s);
        ctx.restore();
      }
      return;
    }
    const img = imgsRef.current[activePhoto];
    if (img) {
      drawPhoto(canvas, img, edit, 640);
      // Template legacy (tanpa slot) = frame full-canvas DI ATAS foto, overlay
      // di atas frame — preview harus sama dengan hasil final (docs/05 §5.9).
      drawFrameOverlay(canvas, frameRef.current);
      drawOverlayLayer(canvas, edit.overlays);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgVersion, frameVersion, edit, edits, active, layout]);

  function patchEdit(patch: (e: PhotoEdit) => PhotoEdit) {
    setEdits((prev) => prev.map((e, i) => (i === activePhoto ? patch(e) : e)));
  }

  function patchAdjust<K extends keyof PhotoEdit["adjust"]>(key: K, value: PhotoEdit["adjust"][K]) {
    patchEdit((e) => ({ ...e, adjust: { ...e.adjust, [key]: value } }));
  }

  /** Terapkan filter foto aktif ke semua foto. */
  function applyFilterToAll() {
    const filter = edit.adjust.filter;
    setEdits((prev) => prev.map((e) => ({ ...e, adjust: { ...e.adjust, filter } })));
  }

  function patchOverlay(id: string, patch: Partial<KioskOverlay>) {
    patchEdit((e) => ({
      ...e,
      overlays: e.overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }));
  }

  function addOverlay(kind: "text" | "sticker", content: string, color = defaultBrandColors.ink) {
    const overlay: KioskOverlay = {
      id: nextId(),
      kind,
      content,
      color,
      size: kind === "text" ? 0.08 : 0.2,
      x: 0.5,
      y: 0.5,
      rotation: 0,
    };
    patchEdit((e) => ({ ...e, overlays: [...e.overlays, overlay] }));
    setSelectedOverlay(overlay.id);
    setText("");
  }

  function removeOverlay(id: string) {
    patchEdit((e) => ({ ...e, overlays: e.overlays.filter((o) => o.id !== id) }));
    setSelectedOverlay(null);
  }

  /** Terapkan akumulasi pan sekali (satu setState, panX+panY bersamaan). */
  function flushPan() {
    panRaf.current = null;
    const acc = panAccum.current;
    const canvas = canvasRef.current;
    if (!acc || !canvas) return;
    panAccum.current = null;
    if (layout) {
      const factor = layout.canvas.width / canvas.width;
      patchEdit((e) => ({
        ...e,
        adjust: {
          ...e.adjust,
          panX: e.adjust.panX + acc.x * factor,
          panY: e.adjust.panY + acc.y * factor,
        },
      }));
      return;
    }
    const img = imgsRef.current[active];
    if (!img) return;
    const scaleX = (img.naturalWidth || 1) / canvas.width;
    const scaleY = (img.naturalHeight || 1) / canvas.height;
    patchEdit((e) => ({
      ...e,
      adjust: {
        ...e.adjust,
        panX: e.adjust.panX + acc.x * scaleX,
        panY: e.adjust.panY + acc.y * scaleY,
      },
    }));
  }

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((e.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
  }

  function hitOverlay(e: React.PointerEvent<HTMLCanvasElement>): KioskOverlay | null {
    const point = canvasPoint(e);
    const width = e.currentTarget.width;
    const height = e.currentTarget.height;
    const candidates = [...edit.overlays].reverse();
    return (
      candidates.find((o) => {
        const radius = Math.max(o.size * height * 0.75, 24);
        return Math.hypot(point.x - o.x * width, point.y - o.y * height) <= radius;
      }) ?? null
    );
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const overlay = hitOverlay(e);
    if (overlay) {
      overlayDragging.current = true;
      lastOverlayPointer.current = canvasPoint(e);
      setSelectedOverlay(overlay.id);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (!allowZoomPan || edit.adjust.zoom <= 1.01) return;
    dragging.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (overlayDragging.current) {
      const previous = lastOverlayPointer.current;
      if (!previous) return;
      const point = canvasPoint(e);
      const canvas = e.currentTarget;
      const dx = (point.x - previous.x) / Math.max(1, canvas.width);
      const dy = (point.y - previous.y) / Math.max(1, canvas.height);
      lastOverlayPointer.current = point;
      if (selectedOverlay) {
        patchOverlay(selectedOverlay, {
          x: Math.min(
            1,
            Math.max(0, (edit.overlays.find((o) => o.id === selectedOverlay)?.x ?? 0.5) + dx)
          ),
          y: Math.min(
            1,
            Math.max(0, (edit.overlays.find((o) => o.id === selectedOverlay)?.y ?? 0.5) + dy)
          ),
        });
      }
      return;
    }
    if (!dragging.current || !allowZoomPan) return;
    const previous = lastPointer.current;
    if (!previous) return;
    // Akumulasi delta; satu flush per frame (rAF), bukan per pointermove.
    const dx = e.clientX - previous.x;
    const dy = e.clientY - previous.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    const acc = panAccum.current ?? { x: 0, y: 0 };
    acc.x += dx;
    acc.y += dy;
    panAccum.current = acc;
    if (panRaf.current === null) panRaf.current = requestAnimationFrame(flushPan);
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    overlayDragging.current = false;
    lastOverlayPointer.current = null;
    dragging.current = false;
    lastPointer.current = null;
    if (panRaf.current !== null) {
      cancelAnimationFrame(panRaf.current);
      panRaf.current = null;
    }
    // Flush sisa delta agar posisi akhir tak hilang saat pointer lepas.
    if (panAccum.current) flushPan();
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  }

  async function finish() {
    try {
      if (frameUrl && (frameError || !frameRef.current)) {
        setFinishError("Frame gagal dimuat. Periksa koneksi lalu coba lagi.");
        return;
      }
      if (layout) {
        // Satu composite resolusi penuh via engine yang sama dengan preview
        // (docs/15 §15.4 — hasil identik builder/kiosk/print).
        const canvas = document.createElement("canvas");
        const sources = slotSources(Number.POSITIVE_INFINITY);
        composeFrame(
          canvas,
          layout,
          frameRef.current,
          sources,
          fillSlots(sources.length, photos.length).map((photoIndex) => transformsFor(photoIndex)),
          Number.POSITIVE_INFINITY,
          { overlays: slotOverlays }
        );
        onFinish([{ blob: await canvasToBlob(canvas) }]);
        return;
      }
      // Template legacy (tanpa slot): tiap foto dirender penuh, lalu frame PNG
      // digambar di atasnya. Tanpa frameRef di sini hasil final kehilangan
      // frame padahal preview menampilkannya (docs/05 §5.9).
      const results: FinalPhoto[] = [];
      for (let i = 0; i < photos.length; i++) {
        const blob = await renderFramedPhotoBlob(
          photos[i]!.blob,
          (edits[i] ?? defaultEdit()),
          frameRef.current
        );
        results.push({ blob });
      }
      onFinish(results);
    } catch {
      // Render canvas bisa gagal (gambar gagal load) — jangan biarkan kiosk
      // stuck diam tanpa pesan.
      setFinishError("Gagal menyimpan hasil. Coba lagi atau hubungi petugas.");
    }
  }

  useEffect(() => {
    if (!finishRequested || autoFinished.current || imgsRef.current.some((img) => !img)) return;
    if (frameUrl && !frameRef.current) return;
    autoFinished.current = true;
    void finish();
    // finish hanya dipicu sekali setelah seluruh asset siap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishRequested, imgVersion, frameVersion, frameUrl]);

  const sliderClass =
    "h-11 w-full cursor-pointer appearance-none rounded-none border border-ink/30 bg-bg accent-ink";

  const panelClass = "flex flex-col gap-3 border-2 border-ink bg-surface p-3.5 md:p-4";
  const sectionLabel = "font-mono text-[10px] font-bold uppercase tracking-[0.18em]";

  return (
    <div
      // `lg:h-full` (bukan `100dvh`): shell KioskApp sudah setinggi layar dan
      // memberi padding safe-area, jadi 100dvh di sini akan meluber.
      className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-bg lg:overflow-hidden"
      style={
        kioskStyle
          ? {
              ...kioskThemeVars(kioskStyle),
              backgroundColor: kioskStyle.bg,
              color: kioskStyle.text,
            }
          : undefined
      }
    >
      <KioskVideoBackground videoUrl={videoUrl} />

      <header
        className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b-2 border-ink/15 px-4 py-3 md:px-6"
        style={
          kioskStyle
            ? {
                backgroundColor: `color-mix(in srgb, ${kioskStyle.text} 5%, ${kioskStyle.bg})`,
                color: kioskStyle.text,
              }
            : undefined
        }
      >
        <div className="flex min-w-0 flex-col gap-1">
          <p className={sectionLabel} style={{ opacity: 0.6 }}>
            {"LANGKAH 03 · EDIT FOTO"}
          </p>
          <h1
            className="font-display uppercase leading-none tracking-[-0.02em]"
            style={{
              fontSize: `calc(clamp(1.15rem, 2.2vw, 1.5rem) * ${kioskStyle?.fontScale ?? 1})`,
              fontFamily: kioskStyle?.fontFamily,
            }}
          >
            {titleText || "Edit foto"}
          </h1>
          {hintText && (
            <p
              className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.1em]"
              style={{ opacity: 0.6 }}
            >
              {hintText}
            </p>
          )}
        </div>
        {photos.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Pilih foto">
            {photos.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                className={`relative size-11 overflow-hidden border-2 border-ink font-mono text-xs font-bold transition-transform active:translate-y-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  i === active ? "bg-accent" : "bg-surface"
                }`}
                aria-label={`Foto ${i + 1}`}
                aria-pressed={i === active}
              >
                {photoUrls[i] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrls[i]!}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                    style={{ filter: filterCss(edits[i]?.adjust.filter) }}
                  />
                ) : null}
                <span className="relative z-10 bg-bg/70 px-1">{i + 1}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Baris grid dikunci ke tinggi sisa layar (`minmax(0,1fr)`). Tanpa itu
          baris mengikuti tinggi kanvas (mis. strip 1:3 setinggi 2160px) dan
          `max-h-full` tidak punya acuan, jadi frame terpotong di bawah. */}
      <div className="relative z-10 grid flex-1 grid-cols-1 gap-4 p-3 sm:p-4 md:gap-5 md:p-5 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        <div className="relative flex min-h-[34vh] items-center justify-center overflow-hidden sm:min-h-[40vh] lg:min-h-0">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="relative max-h-[46vh] max-w-full border-2 border-ink bg-ink shadow-hard sm:max-h-[52vh] lg:max-h-full"
            style={{ cursor: edit.adjust.zoom > 1.01 ? "grab" : "default", touchAction: "none" }}
          />
        </div>

        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pb-1 pr-1 lg:pb-2">
          {/* Filters per foto: setiap foto punya filter sendiri. */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className={sectionLabel} style={{ color: kioskStyle ? kioskStyle.text : undefined }}>
                {`Filter foto ${active + 1}`}
              </p>
              <button
                type="button"
                onClick={applyFilterToAll}
                className="min-h-9 border-2 border-ink bg-surface px-2 py-1 text-[10px] font-bold uppercase tracking-[0.04em] text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                Terapkan ke semua
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {FILTER_PRESETS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => patchAdjust("filter", f.id)}
                  aria-pressed={edit.adjust.filter === f.id}
                  className={`min-h-11 border-2 border-ink px-1.5 py-2 text-[10px] font-bold uppercase leading-tight tracking-[0.02em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                    edit.adjust.filter === f.id ? "bg-accent text-ink" : "bg-surface text-ink"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rotasi (tetap per foto) + zoom via drag/pinch di canvas */}
          <div className="flex items-center gap-2">
            <span
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em]"
              style={{ color: kioskStyle ? kioskStyle.text : undefined }}
            >
              Putar
            </span>
            <div className="flex flex-1 gap-1.5">
              {[0, 90, 180, 270].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => patchAdjust("rotation", r)}
                  className={`h-11 flex-1 border-2 border-ink font-mono text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                    edit.adjust.rotation === r ? "bg-accent text-ink" : "bg-surface text-ink"
                  }`}
                  aria-pressed={edit.adjust.rotation === r}
                >
                  {r}°
                </button>
              ))}
            </div>
          </div>

          {/* Adjustments: exported with the same canvas renderer as preview. */}
          <div className={panelClass}>
            <p className={sectionLabel} style={{ color: kioskStyle ? kioskStyle.text : undefined }}>
              Penyesuaian
            </p>
            <div className="flex flex-col gap-2.5">
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em]">
                  Zoom · {edit.adjust.zoom.toFixed(2)}×
                </span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={edit.adjust.zoom}
                  disabled={!allowZoomPan}
                  onChange={(e) => patchAdjust("zoom", Number(e.target.value))}
                  className={sliderClass}
                  aria-label="Zoom foto"
                />
              </label>
              {(
                [
                  ["brightness", "Kecerahan", 0.5, 1.5, 0.01],
                  ["contrast", "Kontras", 0.5, 1.5, 0.01],
                  ["saturation", "Saturasi", 0, 2, 0.01],
                  ["blur", "Blur", 0, 12, 0.5],
                  ["grain", "Butiran", 0, 1, 0.05],
                  ["vignette", "Vignette cahaya", 0, 1, 0.05],
                ] as const
              ).map(([key, label, min, max, step]) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em]">
                    {label} · {Number(edit.adjust[key]).toFixed(key === "blur" ? 1 : 2)}
                  </span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={edit.adjust[key]}
                    onChange={(e) => patchAdjust(key, Number(e.target.value))}
                    className={sliderClass}
                    aria-label={label}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Stickers */}
          <StickerPicker onPick={(char) => addOverlay("sticker", char)} />

          {/* Text */}
          <div className="flex flex-col gap-2">
            <p className={sectionLabel} style={{ color: kioskStyle ? kioskStyle.text : undefined }}>
              Teks
            </p>
            <div className="flex gap-2">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Tulis teks..."
                maxLength={24}
                className="h-11"
                aria-label="Teks yang akan ditambahkan"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() =>
                  text.trim() && addOverlay("text", text.trim(), defaultBrandColors.ink)
                }
                aria-label="Tambah teks"
              >
                <Plus className="size-4" aria-hidden />
              </Button>
            </div>
          </div>

          {/* Selected overlay editor */}
          {selectedOverlay && (
            <div className={panelClass}>
              <p className={sectionLabel}>
                {`UBAH ${edit.overlays.find((o) => o.id === selectedOverlay)?.kind === "text" ? "TEKS" : "STIKER"}`}
              </p>
              {edit.overlays
                .filter((o) => o.id === selectedOverlay)
                .map((o) => (
                  <div key={o.id} className="flex flex-col gap-3">
                    {o.kind === "text" && (
                      <div className="flex flex-wrap gap-1.5">
                        {TEXT_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => patchOverlay(o.id, { color: c })}
                            className={`size-11 border-2 ${
                              o.color === c
                                ? "border-ink outline-2 outline-offset-1 outline-ink"
                                : "border-ink/30"
                            }`}
                            style={{ background: c }}
                            aria-label={`Warna ${c}`}
                            aria-pressed={o.color === c}
                          />
                        ))}
                      </div>
                    )}
                    <label className="flex flex-col gap-1">
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em]">
                        Ukuran · {o.size.toFixed(2)}
                      </span>
                      <input
                        type="range"
                        min={0.03}
                        max={0.4}
                        step={0.01}
                        value={o.size}
                        onChange={(e) => patchOverlay(o.id, { size: Number(e.target.value) })}
                        className={sliderClass}
                        aria-label="Ukuran teks"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em]">
                        Rotasi · {o.rotation}°
                      </span>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        step={5}
                        value={o.rotation}
                        onChange={(e) => patchOverlay(o.id, { rotation: Number(e.target.value) })}
                        className={sliderClass}
                        aria-label="Rotasi teks"
                      />
                    </label>
                    <div className="flex gap-1.5">
                      {POSITIONS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => patchOverlay(o.id, { y: p.y })}
                          className={`min-h-11 flex-1 border-2 border-ink px-2 py-1 text-[10px] font-bold uppercase tracking-[0.04em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                            Math.abs(o.y - p.y) < 0.01
                              ? "bg-accent text-ink"
                              : "bg-surface text-ink"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => removeOverlay(o.id)}
                    >
                      <Trash2 className="size-4" aria-hidden /> Hapus
                    </Button>
                  </div>
                ))}
            </div>
          )}

          {finishError && (
            <p
              role="alert"
              className="border-2 border-destructive bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-ink"
            >
              {finishError}
            </p>
          )}

          {frameError && (
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Muat ulang frame
            </Button>
          )}

          <Button
            size="lg"
            onClick={() => {
              setFinishError(null);
              void finish();
            }}
            disabled={finishing}
            className="mt-auto min-h-14 bg-accent"
            style={
              kioskStyle
                ? {
                    borderRadius: kioskStyle.radius,
                    backgroundColor: kioskStyle.accent,
                    color: kioskStyle.accentText,
                  }
                : undefined
            }
          >
            <Check className="size-5" aria-hidden />
            {finishing ? "Menyimpan..." : "Selesai"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** memo: props stabil dari KioskApp (useCallback) — hindari re-render tiap
 *  poll config / perubahan state induk yang tak relevan dengan editor. */
export const Editor = memo(EditorInner);
