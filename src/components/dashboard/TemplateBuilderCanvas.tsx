"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LABEL_CLASS as labelClass } from "@/lib/form-ui";
import { defaultBrandColors, slotColors } from "@/lib/brand-defaults";
import { composeFrame, slotClipPath } from "@/lib/compose-frame";
import {
  CANVAS_MAX,
  CANVAS_PRESETS,
  DEFAULT_CANVAS_BACKGROUND,
  MAX_SLOTS,
  SLOT_FITS,
  SLOT_SHAPES,
  clampSlot,
  emptyLayout,
  layoutSchema,
  slotAabb,
  slotsByZ,
  type CanvasPreset,
  type LayoutSlot,
  type TemplateLayout,
} from "@/lib/template-layout";

export type TemplateLayoutSaveResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

type Props = {
  templateName: string;
  initialLayout: TemplateLayout | null;
  initialActive: boolean;
  /** Signed frame URL; drawn ABOVE photos exactly like kiosk. */
  frameUrl?: string | null;
  /** true = platform template bought by owner: no save controls. */
  readOnly?: boolean;
  onSave?: (layout: TemplateLayout, publish: boolean) => Promise<TemplateLayoutSaveResult>;
};

const PREVIEW_MAX_W = 900;
const HEX = /^#[0-9a-fA-F]{6}$/;

const PRESET_OPTIONS: { key: CanvasPreset; label: string }[] = [
  { key: "4x6-portrait", label: "4X6 PORTRAIT" },
  { key: "4x6-landscape", label: "4X6 LANDSCAPE" },
  { key: "2x6-strip", label: "2X6 STRIP" },
  { key: "square", label: "SQUARE" },
  { key: "custom", label: "CUSTOM" },
];

function createPlaceholder(index: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 700;
  canvas.height = 900;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = slotColors[index % slotColors.length] ?? defaultBrandColors.ink;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = defaultBrandColors.ink;
    ctx.font = '700 96px "IBM Plex Mono", "Courier New", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`FOTO ${index + 1}`, canvas.width / 2, canvas.height / 2);
  }
  return canvas;
}

/** Validasi live (klien) yang mencerminkan aturan server — Phase 2 tetap server. */
function validateLayout(layout: TemplateLayout): string[] {
  const errors: string[] = [];
  const { width: W, height: H } = layout.canvas;

  if (layout.slots.length > MAX_SLOTS) {
    errors.push(`Jumlah slot ${layout.slots.length} melebihi batas ${MAX_SLOTS}.`);
  }

  const idCount = new Map<string, number>();
  const zCount = new Map<number, number>();
  for (const slot of layout.slots) {
    idCount.set(slot.id, (idCount.get(slot.id) ?? 0) + 1);
    zCount.set(slot.z, (zCount.get(slot.z) ?? 0) + 1);
  }
  for (const [id, count] of idCount) {
    if (count > 1) errors.push(`ID slot duplikat: ${id}.`);
  }
  for (const [z, count] of zCount) {
    if (count > 1) errors.push(`z duplikat: ${z}.`);
  }

  layout.slots.forEach((slot, i) => {
    const n = i + 1;
    if (slot.width <= 0 || slot.height <= 0) {
      errors.push(`Slot #${n}: width dan height harus > 0.`);
    }
    if (slot.shape === "circle" && Math.abs(slot.width - slot.height) > 0.01) {
      errors.push(`Slot #${n}: shape circle harus persegi (width = height).`);
    }
    const maxRadius = Math.min(slot.width, slot.height) / 2;
    if ((slot.radius ?? 0) > maxRadius) {
      errors.push(`Slot #${n}: radius melebihi ${Math.round(maxRadius)}px.`);
    }
    const box = slotAabb(slot);
    if (box.left < -0.01 || box.top < -0.01 || box.right > W + 0.01 || box.bottom > H + 0.01) {
      errors.push(`Slot #${n}: keluar batas canvas ${W}x${H}.`);
    }
  });

  return errors;
}

function nextSlotId(slots: LayoutSlot[]): string {
  const ids = new Set(slots.map((s) => s.id));
  let seq = 1;
  while (ids.has(`slot-${seq}`)) seq += 1;
  return `slot-${seq}`;
}

function renumberZ(slots: LayoutSlot[]): LayoutSlot[] {
  return [...slots]
    .sort((a, b) => a.z - b.z)
    .map((slot, index) => ({ ...slot, z: index }));
}

type DragState =
  | { mode: "move"; id: string; startX: number; startY: number; origX: number; origY: number }
  | {
      mode: "resize";
      id: string;
      startX: number;
      startY: number;
      origW: number;
      origH: number;
      x: number;
      y: number;
    };

export function TemplateBuilderCanvas({
  templateName,
  initialLayout,
  initialActive,
  frameUrl,
  readOnly = false,
  onSave,
}: Props) {
  const router = useRouter();
  const uid = useId();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const placeholdersRef = useRef<HTMLCanvasElement[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const frameRef = useRef<HTMLImageElement | null>(null);
  const [frameVersion, setFrameVersion] = useState(0);

  const [layout, setLayout] = useState<TemplateLayout>(() => {
    if (initialLayout) {
      const parsed = layoutSchema.safeParse(initialLayout);
      if (parsed.success) return parsed.data;
    }
    return emptyLayout("4x6-portrait");
  });
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    layout.slots.length > 0 ? (layout.slots[0]?.id ?? null) : null
  );
  const [bgInput, setBgInput] = useState(() => layout.canvas.background ?? DEFAULT_CANVAS_BACKGROUND);
  const [saveMessage, setSaveMessage] = useState<
    { kind: "ok"; text: string } | { kind: "error"; text: string; fields: string[] } | null
  >(null);
  const [pending, startTransition] = useTransition();

  const selected = layout.slots.find((slot) => slot.id === selectedId) ?? null;
  const errors = readOnly ? [] : validateLayout(layout);
  const invalid = errors.length > 0;

  useEffect(() => {
    frameRef.current = null;
    if (!frameUrl) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      frameRef.current = img;
      setFrameVersion((v) => v + 1);
    };
    img.onerror = () => {
      if (cancelled) return;
      const retry = new Image();
      retry.onload = () => {
        if (cancelled) return;
        frameRef.current = retry;
        setFrameVersion((v) => v + 1);
      };
      retry.onerror = () => {
        if (cancelled) return;
        frameRef.current = null;
        setFrameVersion((v) => v + 1);
      };
      retry.src = frameUrl;
    };
    img.src = frameUrl;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [frameUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ordered = slotsByZ(layout);
    const placeholders = placeholdersRef.current;
    while (placeholders.length < ordered.length) {
      placeholders.push(createPlaceholder(placeholders.length));
    }
    composeFrame(
      canvas,
      layout,
      frameRef.current,
      ordered.map((_, index) => placeholders[index] ?? null),
      [],
      PREVIEW_MAX_W,
      { emptySlot: "cross" }
    );

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const active = ordered.find((slot) => slot.id === selectedId);
    if (!active) return;

    const scale = canvas.width / layout.canvas.width;
    ctx.save();
    ctx.strokeStyle = defaultBrandColors.destructive;
    ctx.lineWidth = Math.max(2, canvas.width * 0.004);
    ctx.setLineDash([10, 6]);
    slotClipPath(ctx, active, scale);
    ctx.stroke();
    ctx.setLineDash([]);

    const handles = [
      { x: active.x, y: active.y },
      { x: active.x + active.width, y: active.y },
      { x: active.x, y: active.y + active.height },
      { x: active.x + active.width, y: active.y + active.height },
    ];
    const size = Math.max(8, canvas.width * 0.016);
    for (const handle of handles) {
      const hx = handle.x * scale - size / 2;
      const hy = handle.y * scale - size / 2;
      ctx.fillStyle = defaultBrandColors.bg;
      ctx.fillRect(hx, hy, size, size);
      ctx.lineWidth = 2;
      ctx.strokeRect(hx, hy, size, size);
    }
    ctx.restore();
  }, [layout, selectedId, frameVersion, frameUrl]);

  function toLayoutPoint(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number,
    canvasWidth: number
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const drawScale = canvas.width / canvasWidth;
    return {
      x: ((clientX - rect.left) * (canvas.width / rect.width)) / drawScale,
      y: ((clientY - rect.top) * (canvas.height / rect.height)) / drawScale,
    };
  }

  function patchSlot(id: string, patch: Partial<LayoutSlot>) {
    setLayout((prev) => ({
      ...prev,
      slots: prev.slots.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)),
    }));
  }

  function applyCanvasSize(width: number, height: number, preset: CanvasPreset) {
    const nextW = Math.min(CANVAS_MAX, Math.max(1, Math.round(width)));
    const nextH = Math.min(CANVAS_MAX, Math.max(1, Math.round(height)));
    const canvas = { width: nextW, height: nextH };
    setLayout((prev) => ({
      ...prev,
      canvas: { ...prev.canvas, width: nextW, height: nextH, preset },
      slots: prev.slots.map((slot) => {
        const clamped = clampSlot(slot, canvas);
        if (clamped.shape === "circle") {
          const side = Math.min(clamped.width, clamped.height);
          return { ...clamped, width: side, height: side };
        }
        return clamped;
      }),
    }));
  }

  function handlePreset(preset: CanvasPreset) {
    if (preset === "custom") {
      setLayout((prev) => ({ ...prev, canvas: { ...prev.canvas, preset } }));
      return;
    }
    applyCanvasSize(CANVAS_PRESETS[preset].width, CANVAS_PRESETS[preset].height, preset);
  }

  function addSlot() {
    if (readOnly || layout.slots.length >= MAX_SLOTS) return;
    const width = Math.max(1, Math.round(layout.canvas.width * 0.4));
    const height = Math.max(1, Math.round(layout.canvas.height * 0.4));
    const slot: LayoutSlot = {
      id: nextSlotId(layout.slots),
      shape: "rect",
      x: Math.round((layout.canvas.width - width) / 2),
      y: Math.round((layout.canvas.height - height) / 2),
      width,
      height,
      rotation: 0,
      radius: 0,
      fit: "cover",
      z: layout.slots.length,
    };
    setLayout((prev) => ({ ...prev, slots: [...prev.slots, slot] }));
    setSelectedId(slot.id);
  }

  function deleteSlot() {
    if (!selected || readOnly) return;
    const remaining = renumberZ(layout.slots.filter((slot) => slot.id !== selected.id));
    setLayout((prev) => ({ ...prev, slots: remaining }));
    setSelectedId(remaining[0]?.id ?? null);
  }

  function moveZ(direction: -1 | 1) {
    if (!selected || readOnly) return;
    const ordered = [...layout.slots].sort((a, b) => a.z - b.z);
    const index = ordered.findIndex((slot) => slot.id === selected.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const from = ordered[index];
    const to = ordered[target];
    if (!from || !to) return;
    const swapped = ordered.map((slot, i) => (i === index ? to : i === target ? from : slot));
    setLayout((prev) => ({ ...prev, slots: swapped.map((slot, i) => ({ ...slot, z: i })) }));
  }

  function setShape(shape: LayoutSlot["shape"]) {
    if (!selected) return;
    if (shape === "circle") {
      const side = Math.min(selected.width, selected.height);
      patchSlot(selected.id, { shape, width: side, height: side });
      return;
    }
    patchSlot(selected.id, { shape });
  }

  function setWidth(value: number) {
    if (!selected) return;
    if (selected.shape === "circle") {
      patchSlot(selected.id, { width: value, height: value });
      return;
    }
    patchSlot(selected.id, { width: value });
  }

  function setHeight(value: number) {
    if (!selected) return;
    if (selected.shape === "circle") {
      patchSlot(selected.id, { width: value, height: value });
      return;
    }
    patchSlot(selected.id, { height: value });
  }

  function nudge(dx: number, dy: number) {
    if (!selected || readOnly) return;
    const next = clampSlot(
      { ...selected, x: selected.x + dx, y: selected.y + dy },
      layout.canvas
    );
    patchSlot(selected.id, { x: next.x, y: next.y });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    if (readOnly || layout.slots.length === 0) return;
    const point = toLayoutPoint(canvas, event.clientX, event.clientY, layout.canvas.width);
    const drawScale = canvas.width / layout.canvas.width;
    const handleRadius = 18 / Math.max(drawScale, 0.0001);

    if (selected) {
      const cornerX = selected.x + selected.width;
      const cornerY = selected.y + selected.height;
      if (Math.hypot(point.x - cornerX, point.y - cornerY) <= handleRadius) {
        dragRef.current = {
          mode: "resize",
          id: selected.id,
          startX: point.x,
          startY: point.y,
          origW: selected.width,
          origH: selected.height,
          x: selected.x,
          y: selected.y,
        };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = "nwse-resize";
        event.preventDefault();
        return;
      }
    }

    const hit = [...layout.slots]
      .sort((a, b) => b.z - a.z)
      .find(
        (slot) =>
          point.x >= slot.x &&
          point.x <= slot.x + slot.width &&
          point.y >= slot.y &&
          point.y <= slot.y + slot.height
      );
    if (!hit) {
      setSelectedId(null);
      return;
    }
    setSelectedId(hit.id);
    dragRef.current = {
      mode: "move",
      id: hit.id,
      startX: point.x,
      startY: point.y,
      origX: hit.x,
      origY: hit.y,
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
    event.preventDefault();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const point = toLayoutPoint(
      event.currentTarget,
      event.clientX,
      event.clientY,
      layout.canvas.width
    );
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    setLayout((prev) => {
      const slots = prev.slots.map((slot) => {
        if (slot.id !== drag.id) return slot;
        if (drag.mode === "move") {
          return clampSlot({ ...slot, x: drag.origX + dx, y: drag.origY + dy }, prev.canvas);
        }
        const maxW = Math.max(1, prev.canvas.width - drag.x);
        const maxH = Math.max(1, prev.canvas.height - drag.y);
        let width = Math.min(Math.max(1, drag.origW + dx), maxW);
        let height = Math.min(Math.max(1, drag.origH + dy), maxH);
        if (slot.shape === "circle") {
          const side = Math.min(width, height);
          width = side;
          height = side;
        }
        return clampSlot({ ...slot, width, height }, prev.canvas);
      });
      return { ...prev, slots };
    });
    event.preventDefault();
  }

  function endDrag(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.style.cursor = "";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!selected) {
      if (event.key === "Enter" || event.key === " ") {
        const first = layout.slots[0];
        if (first) {
          event.preventDefault();
          setSelectedId(first.id);
        }
      }
      return;
    }
    if (readOnly) return;
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      nudge(-step, 0);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      nudge(step, 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      nudge(0, -step);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      nudge(0, step);
    }
  }

  function save(publish: boolean) {
    if (!onSave || readOnly || invalid || pending) return;
    setSaveMessage(null);
    startTransition(async () => {
      const result = await onSave(layout, publish);
      const fields = result.fieldErrors
        ? Object.entries(result.fieldErrors).flatMap(([key, messages]) =>
            (messages ?? []).map((message) => `${key}: ${message}`)
          )
        : [];
      if (result.error || fields.length > 0) {
        setSaveMessage({
          kind: "error",
          text: result.error ?? "Layout gagal disimpan.",
          fields,
        });
        return;
      }
      setSaveMessage({ kind: "ok", text: `Tersimpan (${publish ? "publish" : "draft"})` });
      router.refresh();
    });
  }

  const canEdit = !readOnly;
  const sortedSlots = [...layout.slots].sort((a, b) => a.z - b.z);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            initialActive
              ? "border-2 border-ink bg-ink px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-bg"
              : "border-2 border-ink bg-muted px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink"
          }
        >
          {initialActive ? "AKTIF" : "DRAFT"}
        </span>
        {readOnly && (
          <span className="border-2 border-destructive bg-destructive/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink">
            TEMPLATE PLATFORM — READ-ONLY
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3" aria-label="Preview template">
          <div
            role="application"
            tabIndex={0}
            aria-label={`Preview template ${templateName}. Gunakan tombol panah untuk menggeser slot terpilih, Shift untuk 10 piksel.`}
            onKeyDown={handleKeyDown}
            className="relative mx-auto w-fit max-w-full border-2 border-ink bg-bg p-2 shadow-[4px_4px_0_0_#111111] outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            <canvas
              ref={canvasRef}
              className="block h-auto max-h-[60vh] w-auto max-w-full touch-none border-2 border-ink bg-ink"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              aria-hidden="true"
            />
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {layout.slots.length === 0
              ? "Belum ada slot. Frame tampil penuh (legacy) sampai Anda menambah slot."
              : `${layout.slots.length} slot · kanvas ${layout.canvas.width}x${layout.canvas.height}`}
          </p>
        </section>

        <section className="flex min-w-0 flex-col gap-5" aria-label="Kontrol layout">
          <div className="flex flex-col gap-2">
            <p className={labelClass}>Slot ({layout.slots.length}/{MAX_SLOTS})</p>
            {layout.slots.length === 0 ? (
              <p className="border-2 border-ink/20 bg-muted px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Belum ada slot. Frame tampil penuh (legacy) sampai Anda menambah slot.
              </p>
            ) : (
              <ul className="flex flex-col divide-y-2 divide-ink/10 border-2 border-ink bg-surface">
                {sortedSlots.map((slot) => (
                  <li key={slot.id}>
                    <button
                      type="button"
                      aria-pressed={selectedId === slot.id}
                      aria-label={`Pilih ${slot.id}, bentuk ${slot.shape}, z ${slot.z}`}
                      onClick={() => setSelectedId(slot.id)}
                      className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left font-mono text-xs uppercase tracking-[0.05em] hover:bg-muted aria-pressed:bg-accent aria-pressed:text-ink focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
                    >
                      <span className="min-w-0 break-words">
                        {`#${layout.slots.findIndex((s) => s.id === slot.id) + 1} · ${slot.shape} · z${slot.z}`}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {`${Math.round(slot.width)}x${Math.round(slot.height)}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Tambah slot"
                onClick={addSlot}
                disabled={layout.slots.length >= MAX_SLOTS}
              >
                <Plus aria-hidden />
                Tambah slot
              </Button>
            )}
          </div>

          {canEdit && selected && (
            <div className="flex flex-col gap-4 border-2 border-ink bg-surface p-3 shadow-[4px_4px_0_0_#111111]">
              <p className={labelClass}>{`Slot terpilih: ${selected.id}`}</p>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  aria-label="Hapus slot terpilih"
                  onClick={deleteSlot}
                >
                  <Trash2 aria-hidden />
                  Hapus slot
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Naikkan z slot terpilih"
                  onClick={() => moveZ(1)}
                >
                  <ArrowUp aria-hidden />
                  Naikkan z
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Turunkan z slot terpilih"
                  onClick={() => moveZ(-1)}
                >
                  <ArrowDown aria-hidden />
                  Turunkan z
                </Button>
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className={labelClass}>Bentuk</legend>
                <div className="flex flex-wrap gap-2">
                  {SLOT_SHAPES.map((shape) => (
                    <Button
                      key={shape}
                      type="button"
                      size="sm"
                      variant={selected.shape === shape ? "default" : "outline"}
                      aria-label={`Bentuk ${shape}`}
                      aria-pressed={selected.shape === shape}
                      onClick={() => setShape(shape)}
                    >
                      {shape}
                    </Button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className={labelClass}>Fit foto</legend>
                <div className="flex flex-wrap gap-2">
                  {SLOT_FITS.map((fit) => (
                    <Button
                      key={fit}
                      type="button"
                      size="sm"
                      variant={(selected.fit ?? "cover") === fit ? "default" : "outline"}
                      aria-label={`Fit ${fit}`}
                      aria-pressed={(selected.fit ?? "cover") === fit}
                      onClick={() => patchSlot(selected.id, { fit })}
                    >
                      {fit}
                    </Button>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${uid}-x`} className={labelClass}>
                    X
                  </label>
                  <Input
                    id={`${uid}-x`}
                    type="number"
                    step={1}
                    value={selected.x}
                    onChange={(event) =>
                      patchSlot(selected.id, {
                        x: Number.isFinite(Number(event.target.value))
                          ? Number(event.target.value)
                          : 0,
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${uid}-y`} className={labelClass}>
                    Y
                  </label>
                  <Input
                    id={`${uid}-y`}
                    type="number"
                    step={1}
                    value={selected.y}
                    onChange={(event) =>
                      patchSlot(selected.id, {
                        y: Number.isFinite(Number(event.target.value))
                          ? Number(event.target.value)
                          : 0,
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${uid}-w`} className={labelClass}>
                    Width
                  </label>
                  <Input
                    id={`${uid}-w`}
                    type="number"
                    step={1}
                    value={selected.width}
                    onChange={(event) => setWidth(Number(event.target.value) || 0)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${uid}-h`} className={labelClass}>
                    Height
                  </label>
                  <Input
                    id={`${uid}-h`}
                    type="number"
                    step={1}
                    value={selected.height}
                    onChange={(event) => setHeight(Number(event.target.value) || 0)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${uid}-radius`} className={labelClass}>
                    Radius
                  </label>
                  <Input
                    id={`${uid}-radius`}
                    type="number"
                    step={1}
                    min={0}
                    max={Math.floor(Math.min(selected.width, selected.height) / 2)}
                    value={selected.radius ?? 0}
                    onChange={(event) =>
                      patchSlot(selected.id, {
                        radius: Number.isFinite(Number(event.target.value))
                          ? Math.max(0, Number(event.target.value))
                          : 0,
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${uid}-rotation`} className={labelClass}>
                    Rotation
                  </label>
                  <Input
                    id={`${uid}-rotation`}
                    type="number"
                    step={1}
                    min={-180}
                    max={180}
                    value={selected.rotation}
                    onChange={(event) =>
                      patchSlot(selected.id, {
                        rotation: Number.isFinite(Number(event.target.value))
                          ? Number(event.target.value)
                          : 0,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {canEdit && (
            <div className="flex flex-col gap-4 border-2 border-ink bg-surface p-3 shadow-[4px_4px_0_0_#111111]">
              <fieldset className="flex flex-col gap-2">
                <legend className={labelClass}>Preset kanvas</legend>
                <div className="flex flex-wrap gap-2">
                  {PRESET_OPTIONS.map((preset) => (
                    <Button
                      key={preset.key}
                      type="button"
                      size="sm"
                      variant={layout.canvas.preset === preset.key ? "default" : "outline"}
                      aria-label={`Preset ${preset.label}`}
                      aria-pressed={layout.canvas.preset === preset.key}
                      onClick={() => handlePreset(preset.key)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${uid}-cw`} className={labelClass}>
                    Canvas width
                  </label>
                  <Input
                    id={`${uid}-cw`}
                    type="number"
                    step={1}
                    min={1}
                    max={CANVAS_MAX}
                    value={layout.canvas.width}
                    onChange={(event) =>
                      applyCanvasSize(
                        Number(event.target.value) || 1,
                        layout.canvas.height,
                        "custom"
                      )
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${uid}-ch`} className={labelClass}>
                    Canvas height
                  </label>
                  <Input
                    id={`${uid}-ch`}
                    type="number"
                    step={1}
                    min={1}
                    max={CANVAS_MAX}
                    value={layout.canvas.height}
                    onChange={(event) =>
                      applyCanvasSize(
                        layout.canvas.width,
                        Number(event.target.value) || 1,
                        "custom"
                      )
                    }
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${uid}-bg-color`} className={labelClass}>
                    Background
                  </label>
                  <input
                    id={`${uid}-bg-color`}
                    type="color"
                    value={HEX.test(bgInput) ? bgInput : DEFAULT_CANVAS_BACKGROUND}
                    onChange={(event) => {
                      const value = event.target.value;
                      setBgInput(value);
                      setLayout((prev) => ({
                        ...prev,
                        canvas: { ...prev.canvas, background: value },
                      }));
                    }}
                    aria-label="Warna background kanvas"
                    className="h-11 w-20 cursor-pointer border-2 border-ink bg-surface p-1 shadow-[2px_2px_0_0_#111111] focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
                  />
                </div>
                <div className="flex min-w-40 flex-1 flex-col gap-1">
                  <label htmlFor={`${uid}-bg-hex`} className={labelClass}>
                    Hex
                  </label>
                  <Input
                    id={`${uid}-bg-hex`}
                    value={bgInput}
                    onChange={(event) => {
                      const value = event.target.value;
                      setBgInput(value);
                      if (HEX.test(value)) {
                        setLayout((prev) => ({
                          ...prev,
                          canvas: { ...prev.canvas, background: value },
                        }));
                      }
                    }}
                    aria-invalid={!HEX.test(bgInput)}
                    placeholder="#ffffff"
                  />
                  {!HEX.test(bgInput) && (
                    <p className="font-mono text-[10px] uppercase text-destructive">
                      Hex harus format #rrggbb
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {canEdit && (
            <div className="flex flex-col gap-3">
              {invalid && (
                <div
                  role="alert"
                  className="border-2 border-destructive bg-destructive/10 px-3 py-2"
                >
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.08em]">
                    {`${errors.length} masalah layout — simpan dinonaktifkan`}
                  </p>
                  <ul className="mt-2 flex list-inside list-disc flex-col gap-1 font-mono text-[11px] text-ink">
                    {errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {saveMessage?.kind === "ok" && (
                <p
                  role="status"
                  className="border-2 border-ink bg-accent px-3 py-2 font-mono text-xs font-bold uppercase tracking-[0.08em]"
                >
                  {saveMessage.text}
                </p>
              )}

              {saveMessage?.kind === "error" && (
                <div
                  role="alert"
                  className="border-2 border-destructive bg-destructive/10 px-3 py-2"
                >
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.08em]">
                    {saveMessage.text}
                  </p>
                  {saveMessage.fields.length > 0 && (
                    <ul className="mt-2 flex list-inside list-disc flex-col gap-1 font-mono text-[11px]">
                      {saveMessage.fields.map((field) => (
                        <li key={field}>{field}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {onSave && (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => save(false)}
                    disabled={invalid || pending}
                    aria-label="Simpan draft"
                  >
                    {pending ? "Menyimpan…" : "Simpan draft"}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => save(true)}
                    disabled={invalid || pending}
                    aria-label="Publish template"
                  >
                    {pending ? "Menyimpan…" : "Publish"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
