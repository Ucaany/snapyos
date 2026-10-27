"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Plus, Trash2, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { LABEL_CLASS as labelClass } from "@/lib/form-ui";
import type { TemplateRow } from "@/server/templates";
import type { FormState } from "@/server/auth-actions";
import { saveTemplateBuilderAction } from "@/server/catalog-actions";
import { composeFrame, slotClipPath } from "@/lib/compose-frame";
import { slotColors } from "@/lib/brand-defaults";
import {
  CANVAS_MAX,
  CANVAS_PRESETS,
  MAX_SLOTS,
  SLOT_FITS,
  SLOT_SHAPES,
  clampSlot,
  emptyLayout,
  layoutSchema,
  slotCount,
  slotsByZ,
  type CanvasPreset,
  type LayoutSlot,
  type TemplateLayout,
} from "@/lib/template-layout";

const initial: FormState = {};

const DISPLAY_MAX = 900; // resolusi canvas editor di layar (px)
const MIN_SLOT = 40; // ukuran slot minimal (px design)
const HANDLE_R = 7; // radius handle (px display canvas)
const ROTATE_OFFSET = 46; // jarak handle rotasi dari tepi atas slot (px design)

const SAMPLE_COLORS = slotColors;

function normAngle(deg: number): number {
  return ((((Math.round(deg) + 180) % 360) + 360) % 360) - 180;
}

/** Fallback sinkron canvas → Blob (toDataURL tak pernah menggantung).
 *  Dipakai bila `canvas.toBlob` tidak memanggil callback (quirk Chromium). */
function dataUrlToBlob(canvas: HTMLCanvasElement): Blob | null {
  try {
    const dataUrl = canvas.toDataURL("image/png");
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: "image/png" });
  } catch {
    return null;
  }
}

/** Foto sample deterministik untuk preview (docs/15 §15.3). */
function makeSample(i: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 1600;
  c.height = 1200;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const grad = ctx.createLinearGradient(0, 0, 1600, 1200);
  grad.addColorStop(0, SAMPLE_COLORS[i % SAMPLE_COLORS.length]!);
  grad.addColorStop(1, "#111111");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1600, 1200);
  ctx.fillStyle = "#FFFDF5";
  ctx.font = '900 480px "Archivo Black", "IBM Plex Sans", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(i + 1), 800, 640);
  return c;
}

/** Titik sudut slot dalam koordinat design (sudah dirotasi pivot center). */
function cornerPoints(slot: LayoutSlot): { x: number; y: number }[] {
  const cx = slot.x + slot.width / 2;
  const cy = slot.y + slot.height / 2;
  const r = (slot.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const local = [
    { x: 0, y: 0 },
    { x: slot.width, y: 0 },
    { x: slot.width, y: slot.height },
    { x: 0, y: slot.height },
  ];
  return local.map((p) => {
    const lx = p.x - slot.width / 2;
    const ly = p.y - slot.height / 2;
    return { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos };
  });
}

/** Titik dalam koordinat lokal slot (inverse rotasi). */
function toLocal(slot: LayoutSlot, px: number, py: number): { x: number; y: number } {
  const cx = slot.x + slot.width / 2;
  const cy = slot.y + slot.height / 2;
  const r = -(slot.rotation * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: dx * Math.cos(r) - dy * Math.sin(r) + slot.width / 2,
    y: dx * Math.sin(r) + dy * Math.cos(r) + slot.height / 2,
  };
}

type Drag =
  | { mode: "move"; slotId: string; startX: number; startY: number; orig: LayoutSlot }
  | {
      mode: "resize";
      slotId: string;
      corner: number;
      startX: number;
      startY: number;
      orig: LayoutSlot;
    }
  | { mode: "rotate"; slotId: string; startAngle: number; orig: LayoutSlot };

type Props = {
  template: TemplateRow;
  /** Aksi simpan — owner default; admin memakai saveGlobalTemplateBuilderAction. */
  saveAction?: (prev: FormState, formData: FormData) => Promise<FormState>;
  /** Tujuan tombol Kembali — owner default; admin memakai /admin/templates. */
  backHref?: string;
};

/** TemplateBuilder — drag/resize/rotate slot di atas frame PNG (docs/15 §15.3). */
export function TemplateBuilder({
  template,
  saveAction = saveTemplateBuilderAction,
  backHref = "/dashboard/templates",
}: Props) {
  const [layout, setLayout] = useState<TemplateLayout>(() => {
    const parsed = layoutSchema.safeParse(template.layout);
    return parsed.success ? parsed.data : emptyLayout("4x6-portrait");
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [frameVersion, setFrameVersion] = useState(0);
  const [saveState, action, saving] = useActionState(saveAction, initial);
  const [, startSaveTransition] = useTransition();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const chromaInputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(layout.slots.length);
  const [chromaError, setChromaError] = useState<string | null>(null);
  const [chromaBusy, setChromaBusy] = useState(false);
  const [samplingChroma, setSamplingChroma] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const [frameRetry, setFrameRetry] = useState(0);
  const [chromaKey, setChromaKey] = useState("#00ff00");
  const [chromaTolerance, setChromaTolerance] = useState(70);

  const selected = layout.slots.find((s) => s.id === selectedId) ?? null;
  // Sample canvas dibuat client-side SAJA (document tidak tersedia saat SSR).
  // Lazy via ref: dibuat saat pertama dibutuhkan (draw/thumbnail), bukan saat render.
  const samplesRef = useRef<HTMLCanvasElement[] | null>(null);
  const getSamples = useCallback((): HTMLCanvasElement[] => {
    if (!samplesRef.current) {
      samplesRef.current = Array.from({ length: MAX_SLOTS }, (_, i) => makeSample(i));
    }
    return samplesRef.current;
  }, []);

  // load frame PNG (signed URL; crossOrigin agar canvas bisa diekspor)
  useEffect(() => {
    if (!template.preview_url) {
      frameRef.current = null;
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) {
        frameRef.current = img;
        setFrameReady(true);
        setFrameError(false);
        setFrameVersion((v) => v + 1);
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        frameRef.current = null;
        setFrameReady(false);
        setFrameError(true);
      }
    };
    img.src = template.preview_url;
    return () => {
      cancelled = true;
    };
  }, [template.preview_url, frameRetry]);

  // redraw canvas (edit overlay atau preview via composeFrame — satu engine)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (previewMode) {
      composeFrame(canvas, layout, frameRef.current, getSamples(), [], DISPLAY_MAX);
      return;
    }
    const scale = Math.min(1, DISPLAY_MAX / layout.canvas.width);
    canvas.width = Math.max(1, Math.round(layout.canvas.width * scale));
    canvas.height = Math.max(1, Math.round(layout.canvas.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFDF5";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (frameRef.current) {
      ctx.drawImage(frameRef.current, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.strokeStyle = "#111111";
      ctx.lineWidth = 2;
      ctx.setLineDash([16, 12]);
      ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
      ctx.setLineDash([]);
    }
    slotsByZ(layout).forEach((slot, i) => {
      const isSelected = slot.id === selectedId;
      ctx.save();
      const cx = (slot.x + slot.width / 2) * scale;
      const cy = (slot.y + slot.height / 2) * scale;
      ctx.translate(cx, cy);
      ctx.rotate((slot.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);

      ctx.fillStyle = "rgba(230, 25, 25, 0.14)";
      slotClipPath(ctx, slot, scale);
      ctx.fill();
      ctx.lineWidth = isSelected ? 4 : 2;
      ctx.strokeStyle = isSelected ? "#E61919" : "#111111";
      ctx.setLineDash(isSelected ? [] : [10, 6]);
      slotClipPath(ctx, slot, scale);
      ctx.stroke();
      ctx.setLineDash([]);

      // nomor urut z
      ctx.fillStyle = "#111111";
      ctx.font = `700 ${Math.max(12, slot.height * scale * 0.18)}px "IBM Plex Mono", monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        String(i + 1),
        (slot.x + slot.width / 2) * scale,
        (slot.y + slot.height / 2) * scale
      );
      ctx.restore();

      if (isSelected) {
        // handles sudut + rotasi (di luar rotasi ctx — koordinat absolut)
        const corners = cornerPoints(slot);
        corners.forEach((p) => {
          ctx.fillStyle = "#FFFDF5";
          ctx.strokeStyle = "#E61919";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x * scale, p.y * scale, HANDLE_R, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        });
        const top = corners[0]!;
        const right = corners[1]!;
        const midX = (top.x + right.x) / 2;
        const midY = (top.y + right.y) / 2;
        const r = (slot.rotation * Math.PI) / 180;
        const hx = midX + Math.sin(r) * ROTATE_OFFSET;
        const hy = midY - Math.cos(r) * ROTATE_OFFSET;
        ctx.strokeStyle = "#E61919";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(midX * scale, midY * scale);
        ctx.lineTo(hx * scale, hy * scale);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(hx * scale, hy * scale, HANDLE_R, 0, Math.PI * 2);
        ctx.fillStyle = "#E61919";
        ctx.fill();
      }
    });
  }, [layout, selectedId, previewMode, frameVersion, getSamples]);

  const toDesign = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * layout.canvas.width,
        y: ((e.clientY - rect.top) / rect.height) * layout.canvas.height,
      };
    },
    [layout.canvas.width, layout.canvas.height]
  );

  function patchSlot(id: string, patch: Partial<LayoutSlot>) {
    setLayout((prev) => ({
      ...prev,
      slots: prev.slots.map((s) => (s.id === id ? clampSlot({ ...s, ...patch }, prev.canvas) : s)),
    }));
  }

  function addSlot() {
    if (layout.slots.length >= MAX_SLOTS) return;
    seqRef.current += 1;
    const id = `slot_${seqRef.current}_${Date.now().toString(36)}`;
    const w = Math.round(layout.canvas.width * 0.7);
    const h = Math.round(layout.canvas.height * 0.28);
    setLayout((prev) => ({
      ...prev,
      slots: [
        ...prev.slots,
        clampSlot(
          {
            id,
            shape: "rect",
            x: Math.round((layout.canvas.width - w) / 2),
            y: Math.round((layout.canvas.height - h) / 2),
            width: w,
            height: h,
            rotation: 0,
            radius: 24,
            fit: "cover",
            z: prev.slots.reduce((m, s) => Math.max(m, s.z), 0) + 1,
          },
          layout.canvas
        ),
      ],
    }));
    setSelectedId(id);
    setPreviewMode(false);
  }

  function removeSlot(id: string) {
    setLayout((prev) => ({ ...prev, slots: prev.slots.filter((s) => s.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  }

  function changePreset(preset: CanvasPreset) {
    setLayout((prev) => {
      const dims =
        preset === "custom"
          ? { width: prev.canvas.width, height: prev.canvas.height }
          : CANVAS_PRESETS[preset];
      const canvas = { width: dims.width, height: dims.height, preset };
      return { ...prev, canvas, slots: prev.slots.map((s) => clampSlot(s, canvas)) };
    });
  }

  function changeCustomSize(which: "width" | "height", value: number) {
    const v = Math.min(CANVAS_MAX, Math.max(100, Math.round(value) || 100));
    setLayout((prev) => {
      const canvas = { ...prev.canvas, [which]: v, preset: "custom" as CanvasPreset };
      return { ...prev, canvas, slots: prev.slots.map((s) => clampSlot(s, canvas)) };
    });
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (previewMode) return;
    if (samplingChroma) {
      sampleChromaColor(e);
      return;
    }
    const p = toDesign(e);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const tol = 14 * (layout.canvas.width / rect.width);

    // 1) handles slot terpilih
    if (selected) {
      const corners = cornerPoints(selected);
      for (let i = 0; i < corners.length; i++) {
        if (Math.hypot(corners[i]!.x - p.x, corners[i]!.y - p.y) <= tol) {
          dragRef.current = {
            mode: "resize",
            slotId: selected.id,
            corner: i,
            startX: p.x,
            startY: p.y,
            orig: { ...selected },
          };
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
      }
      const top = corners[0]!;
      const right = corners[1]!;
      const midX = (top.x + right.x) / 2;
      const midY = (top.y + right.y) / 2;
      const r = (selected.rotation * Math.PI) / 180;
      const hx = midX + Math.sin(r) * ROTATE_OFFSET;
      const hy = midY - Math.cos(r) * ROTATE_OFFSET;
      if (Math.hypot(hx - p.x, hy - p.y) <= tol) {
        const cx = selected.x + selected.width / 2;
        const cy = selected.y + selected.height / 2;
        dragRef.current = {
          mode: "rotate",
          slotId: selected.id,
          startAngle: Math.atan2(p.y - cy, p.x - cx),
          orig: { ...selected },
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }

    // 2) hit-test slot (paling atas dulu = z terbesar)
    const ordered = slotsByZ(layout).reverse();
    for (const slot of ordered) {
      const lp = toLocal(slot, p.x, p.y);
      if (lp.x >= 0 && lp.x <= slot.width && lp.y >= 0 && lp.y <= slot.height) {
        setSelectedId(slot.id);
        dragRef.current = {
          mode: "move",
          slotId: slot.id,
          startX: p.x,
          startY: p.y,
          orig: { ...slot },
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }
    setSelectedId(null);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const p = toDesign(e);
    if (drag.mode === "move") {
      patchSlot(drag.slotId, {
        x: drag.orig.x + (p.x - drag.startX),
        y: drag.orig.y + (p.y - drag.startY),
      });
      return;
    }
    if (drag.mode === "rotate") {
      const cx = drag.orig.x + drag.orig.width / 2;
      const cy = drag.orig.y + drag.orig.height / 2;
      const a = Math.atan2(p.y - cy, p.x - cx);
      patchSlot(drag.slotId, {
        rotation: normAngle(drag.orig.rotation + ((a - drag.startAngle) * 180) / Math.PI),
      });
      return;
    }
    // resize: delta diubah ke sumbu lokal slot
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;
    const r = (drag.orig.rotation * Math.PI) / 180;
    const lx = dx * Math.cos(r) + dy * Math.sin(r);
    const ly = -dx * Math.sin(r) + dy * Math.cos(r);
    const o = drag.orig;
    let x = o.x;
    let y = o.y;
    let w = o.width;
    let h = o.height;
    switch (drag.corner) {
      case 0:
        x = o.x + lx;
        y = o.y + ly;
        w = o.width - lx;
        h = o.height - ly;
        break; // TL
      case 1:
        y = o.y + ly;
        w = o.width + lx;
        h = o.height - ly;
        break; // TR
      case 2:
        w = o.width + lx;
        h = o.height + ly;
        break; // BR
      default:
        x = o.x + lx;
        h = o.height + ly;
        w = o.width - lx;
        break; // BL
    }
    w = Math.max(MIN_SLOT, w);
    h = Math.max(MIN_SLOT, h);
    patchSlot(drag.slotId, { x, y, width: w, height: h });
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  /** Layout dibulatkan sebelum disimpan (kontrak px design, docs/15 §15.2).
   *  Bulatkan DULU, clamp setelahnya: `x=0.5, w=1199.5` akan menjadi 1+1200
   *  dan melewati canvas kalau urutannya dibalik. */
  const roundedLayout: TemplateLayout = useMemo(() => {
    const canvas = {
      ...layout.canvas,
      width: Math.round(layout.canvas.width),
      height: Math.round(layout.canvas.height),
    };
    return {
      ...layout,
      canvas,
      slots: layout.slots.map((s) =>
        clampSlot(
          {
            ...s,
            x: Math.round(s.x),
            y: Math.round(s.y),
            width: Math.round(s.width),
            height: Math.round(s.height),
            radius: s.radius !== undefined ? Math.round(s.radius) : undefined,
          },
          canvas
        )
      ),
    };
  }, [layout]);

  /** Thumbnail otomatis dari preview slot terisi (docs/15 §15.3).
   *  `toBlob` pada Chromium kadang TIDAK memanggil callback (canvas besar /
   *  kondisi GPU) → save menggantung dan layout tak tersimpan. Guard: timeout
   *  pendek + fallback sinkron `toDataURL` (selalu resolve). Thumbnail opsional;
   *  layout tetap wajib tersimpan. */
  async function generateThumbnail(): Promise<File | null> {
    if (layout.slots.length === 0) return null;
    const canvas = document.createElement("canvas");
    composeFrame(
      canvas,
      roundedLayout,
      frameRef.current,
      getSamples(),
      [],
      Number.POSITIVE_INFINITY
    );
    const blob = await new Promise<Blob | null>((resolve) => {
      let settled = false;
      const finish = (b: Blob | null) => {
        if (settled) return;
        settled = true;
        resolve(b);
      };
      const timer = setTimeout(() => finish(null), 800);
      const settle = (b: Blob | null) => {
        clearTimeout(timer);
        finish(b);
      };
      try {
        canvas.toBlob((b) => settle(b), "image/png");
      } catch {
        settle(null);
      }
    });
    const safeBlob = blob ?? dataUrlToBlob(canvas);
    if (!safeBlob) return null;
    return new File([safeBlob], `thumbnail-${template.id}.png`, { type: "image/png" });
  }

  async function applyChromaKey(selectedColor: string) {
    setChromaError(null);
    setChromaBusy(true);
    try {
      const src = frameRef.current;
      if (!src) throw new Error("Frame belum siap");
      const canvas = document.createElement("canvas");
      canvas.width = src.naturalWidth;
      canvas.height = src.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Browser tidak mendukung pemrosesan gambar");
      ctx.drawImage(src, 0, 0);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const hex = selectedColor.slice(1);
      const keyR = Number.parseInt(hex.slice(0, 2), 16);
      const keyG = Number.parseInt(hex.slice(2, 4), 16);
      const keyB = Number.parseInt(hex.slice(4, 6), 16);
      for (let i = 0; i < image.data.length; i += 4) {
        const distance = Math.hypot(
          image.data[i]! - keyR,
          image.data[i + 1]! - keyG,
          image.data[i + 2]! - keyB
        );
        image.data[i + 3] =
          distance <= chromaTolerance
            ? 0
            : distance <= chromaTolerance + 35
              ? Math.round(((distance - chromaTolerance) / 35) * image.data[i + 3]!)
              : image.data[i + 3]!;
      }
      ctx.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Gagal membuat PNG transparan");
      const dt = new DataTransfer();
      dt.items.add(new File([blob], `chroma-${template.id}.png`, { type: "image/png" }));
      if (chromaInputRef.current) chromaInputRef.current.files = dt.files;
      const preview = URL.createObjectURL(blob);
      frameRef.current = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Preview gagal dimuat"));
        img.src = preview;
      });
      setFrameVersion((v) => v + 1);
      setSamplingChroma(false);
    } catch (error) {
      setChromaError(error instanceof Error ? error.message : "Chroma key gagal diproses");
    } finally {
      setChromaBusy(false);
    }
  }

  function sampleChromaColor(e: React.PointerEvent<HTMLCanvasElement>) {
    const sourceImage = frameRef.current;
    if (!sourceImage || chromaBusy) return;
    const point = toDesign(e);
    const source = document.createElement("canvas");
    source.width = sourceImage.naturalWidth;
    source.height = sourceImage.naturalHeight;
    const ctx = source.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(sourceImage, 0, 0);
    const x = Math.max(
      0,
      Math.min(source.width - 1, Math.round((point.x / layout.canvas.width) * source.width))
    );
    const y = Math.max(
      0,
      Math.min(source.height - 1, Math.round((point.y / layout.canvas.height) * source.height))
    );
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
    const color = `#${[r, g, b].map((value) => value!.toString(16).padStart(2, "0")).join("")}`;
    setChromaKey(color);
    void applyChromaKey(color);
  }

  // Submit satu tahap: intercept → generate thumbnail → dispatch action via
  // FormData (bukan requestSubmit dua-kali; pola itu balapan dengan handler
  // React `useActionState` sehingga action kadang tak pernah jalan — layout
  // gagal tersimpan). Dispatch imperatif deterministik.
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (roundedLayout.slots.length === 0) {
      const ok = window.confirm(
        "Template ini tidak punya slot: foto customer akan tampil full-canvas (mode legacy). Tetap publish?"
      );
      if (!ok) return;
    }
    const formData = new FormData(form);
    formData.set("layout", JSON.stringify(roundedLayout));
    try {
      const file = await generateThumbnail();
      if (file) formData.set("thumbnail", file);
    } catch {
      // thumbnail gagal (mis. canvas tainted) — layout tetap tersimpan
    }
    const chromaFile = chromaInputRef.current?.files?.[0];
    if (chromaFile) formData.set("chroma_file", chromaFile);
    startSaveTransition(() => {
      void action(formData);
    });
  }

  const num = (v: number) => Math.round(v);
  const orderedSlots = slotsByZ(layout);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 xl:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-ink"
          >
            <ArrowLeft className="size-4" aria-hidden /> Kembali
          </Link>
          <h1 className="text-2xl font-semibold leading-none md:text-4xl">
            Builder: {template.name}
          </h1>
          <p className="text-xs text-muted-foreground md:text-sm">
            {`CANVAS ${layout.canvas.width}×${layout.canvas.height} · ${layout.slots.length}/${MAX_SLOTS} SLOT · ${
              template.is_active ? "PUBLISHED" : "DRAFT"
            }`}
          </p>
        </div>
        <StatusBadge status={template.is_active ? "active" : "inactive"} />
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        {/* Kolom canvas */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-none border-2 border-ink p-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                Preset
                <select
                  value={layout.canvas.preset}
                  onChange={(e) => changePreset(e.target.value as CanvasPreset)}
                  className="h-9 rounded-none border-2 border-ink bg-surface px-2 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  {Object.keys(CANVAS_PRESETS).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="custom">CUSTOM</option>
                </select>
              </label>
              {layout.canvas.preset === "custom" && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-sm font-medium">
                    W
                    <Input
                      type="number"
                      min={100}
                      max={CANVAS_MAX}
                      value={layout.canvas.width}
                      onChange={(e) => changeCustomSize("width", Number(e.target.value))}
                      className="h-9 w-24"
                    />
                  </label>
                  <label className="flex items-center gap-1 text-sm font-medium">
                    H
                    <Input
                      type="number"
                      min={100}
                      max={CANVAS_MAX}
                      value={layout.canvas.height}
                      onChange={(e) => changeCustomSize("height", Number(e.target.value))}
                      className="h-9 w-24"
                    />
                  </label>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreviewMode((v) => !v)}
              >
                {previewMode ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                {previewMode ? "Edit slot" : "Preview"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={addSlot}
                disabled={layout.slots.length >= MAX_SLOTS}
              >
                <Plus aria-hidden /> Tambah slot
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-none border-2 border-ink bg-muted/30 p-3 md:p-4">
            <div className="flex min-w-max justify-center">
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                className="h-auto max-h-[70dvh] w-auto max-w-full touch-none rounded-none border-2 border-ink bg-bg"
                style={{ cursor: previewMode ? "default" : selected ? "move" : "default" }}
              />
            </div>
          </div>

          {frameError && (
            <p
              role="alert"
              className="flex items-center justify-between gap-3 border-2 border-destructive bg-destructive/10 px-3 py-2 text-xs text-ink"
            >
              <span>Frame gagal dimuat: preview &amp; chroma key tidak tersedia.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setFrameReady(false);
                  setFrameError(false);
                  setFrameRetry((v) => v + 1);
                }}
              >
                Muat ulang frame
              </Button>
            </p>
          )}

          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {
              "DRAG = GERAK · HANDLE SUDUT = UKURAN · HANDLE ATAS = ROTASI · PREVIEW = SLOT TERISI FOTO SAMPLE"
            }
          </p>
        </div>

        {/* Kolom panel: daftar slot + properti + simpan */}
        <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">
          <div className="flex flex-col gap-3 rounded-none border-2 border-ink p-4">
            <p className="font-mono text-xs uppercase tracking-[0.1em]">
              {`Slot: ${layout.slots.length}/${MAX_SLOTS}`}
            </p>
            {orderedSlots.length === 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Belum ada slot. Klik TAMBAH SLOT. Foto customer otomatis ter-composite pas ke setiap
                slot.
              </p>
            ) : (
              <ul className="flex flex-col">
                {orderedSlots.map((slot, i) => (
                  <li key={slot.id} className="flex items-center gap-1 border-t first:border-t-0">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(slot.id);
                        setPreviewMode(false);
                      }}
                      aria-pressed={slot.id === selectedId}
                      className={`flex min-h-11 flex-1 items-center justify-between gap-2 py-2 text-left text-sm ${
                        slot.id === selectedId ? "font-medium text-ink" : "text-muted-foreground"
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="mr-2 inline-flex size-5 shrink-0 items-center justify-center rounded-none border-2 border-ink text-[11px] font-medium">
                          {i + 1}
                        </span>
                        {`${slot.shape} ${Math.round(slot.width)}×${Math.round(slot.height)}`}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSlot(slot.id)}
                      aria-label={`Hapus slot ${i + 1}`}
                      className="flex size-11 shrink-0 items-center justify-center border-2 border-transparent text-destructive hover:border-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-4 rounded-none border-2 border-ink p-4 shadow-[4px_4px_0_#111]">
            <p className="font-mono text-xs uppercase tracking-[0.1em]">Properti slot</p>
            {selected ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["x", "X"],
                      ["y", "Y"],
                      ["width", "Lebar"],
                      ["height", "Tinggi"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex flex-col gap-1">
                      <span className={labelClass}>{label}</span>
                      <Input
                        type="number"
                        value={num(selected[key])}
                        onChange={(e) => patchSlot(selected.id, { [key]: Number(e.target.value) })}
                        className="h-9"
                      />
                    </label>
                  ))}
                </div>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>{`Bentuk`}</span>
                  <Select
                    value={selected.shape}
                    onChange={(e) =>
                      patchSlot(selected.id, { shape: e.target.value as LayoutSlot["shape"] })
                    }
                  >
                    {SLOT_SHAPES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </label>
                {selected.shape === "rounded" && (
                  <label className="flex flex-col gap-1">
                    <span className={labelClass}>{`Radius: ${selected.radius ?? 0}px`}</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.round(Math.min(selected.width, selected.height) / 2)}
                      step={1}
                      value={selected.radius ?? 0}
                      onChange={(e) => patchSlot(selected.id, { radius: Number(e.target.value) })}
                      className="h-2 w-full cursor-pointer accent-foreground"
                    />
                  </label>
                )}
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Fit foto</span>
                  <Select
                    value={selected.fit ?? "cover"}
                    onChange={(e) =>
                      patchSlot(selected.id, { fit: e.target.value as LayoutSlot["fit"] })
                    }
                  >
                    {SLOT_FITS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>{`Rotasi: ${Math.round(selected.rotation)}°`}</span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={Math.round(selected.rotation)}
                    onChange={(e) => patchSlot(selected.id, { rotation: Number(e.target.value) })}
                    className="h-2 w-full cursor-pointer accent-foreground"
                  />
                </label>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => removeSlot(selected.id)}
                >
                  <Trash2 aria-hidden /> Hapus slot
                </Button>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Belum ada slot dipilih. Klik slot di canvas, pilih dari daftar slot, atau TAMBAH
                SLOT.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-4 rounded-none border-2 border-ink bg-accent/20 p-4 shadow-[4px_4px_0_#111]">
            <div className="flex items-center gap-2">
              <WandSparkles className="size-4" aria-hidden />
              <p className="font-mono text-xs uppercase tracking-[0.1em]">
                Chroma key / hapus background
              </p>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Upload frame lebih dulu. Aktifkan pemilih, lalu klik background hijau/biru pada
              preview. Pixel warna terpilih dihapus, tepi diberi feather.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className={labelClass}>Warna key</span>
                <input
                  type="color"
                  value={chromaKey}
                  onChange={(e) => setChromaKey(e.target.value)}
                  className="h-11 w-full border-2 border-ink bg-surface p-1"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClass}>{`Toleransi: ${chromaTolerance}`}</span>
                <input
                  type="range"
                  min={10}
                  max={180}
                  value={chromaTolerance}
                  onChange={(e) => setChromaTolerance(Number(e.target.value))}
                  className="mt-4 h-2 w-full cursor-pointer accent-foreground"
                />
              </label>
            </div>
            {chromaError && (
              <p role="alert" className="text-xs text-destructive">
                {chromaError}
              </p>
            )}
            <Button
              type="button"
              variant={samplingChroma ? "secondary" : "outline"}
              size="sm"
              onClick={() => setSamplingChroma((value) => !value)}
              disabled={chromaBusy || !frameReady}
            >
              <WandSparkles aria-hidden />{" "}
              {chromaBusy
                ? "Memproses…"
                : samplingChroma
                  ? "Klik background pada frame"
                  : "Pilih warna dari frame"}
            </Button>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Warna terpilih: {chromaKey} · output PNG · file asli tidak berubah sampai SIMPAN
            </p>
          </div>

          <form
            onSubmit={(e) => void onSubmit(e)}
            className="flex flex-col gap-3 rounded-none border-2 border-ink p-4 shadow-[4px_4px_0_#111]"
          >
            <input type="hidden" name="id" value={template.id} />
            <input type="hidden" name="layout" value={JSON.stringify(roundedLayout)} />
            <input
              ref={chromaInputRef}
              type="file"
              name="chroma_file"
              hidden
              tabIndex={-1}
              aria-hidden
              accept="image/png"
            />
            <p className="font-mono text-xs uppercase tracking-[0.1em]">Simpan</p>
            <p className="font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
              {`Slot: ${slotCount(roundedLayout)}. Frame ber-slot dapat dipakai lintas package; jumlah capture mengikuti slot.`}
            </p>
            {saveState.error && (
              <p
                role="alert"
                className="rounded-none border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm text-ink"
              >
                {saveState.error}
              </p>
            )}
            {saveState.fieldErrors?.layout && (
              <p role="alert" className="text-xs text-destructive">
                {saveState.fieldErrors.layout[0]}
              </p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={template.is_active}
                disabled={saving}
                className="size-4"
              />
              Publish (aktif &amp; bisa dipilih customer)
            </label>
            <Button type="submit" disabled={saving}>
              {saving ? "Menyimpan…" : "Simpan template"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
