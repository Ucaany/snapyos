"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, CopyPlus, Maximize, Plus, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react";

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
  clampSlot,
  emptyLayout,
  layoutSchema,
  slotsByZ,
  type CanvasPreset,
  type EditorProperties,
  type LayoutSlot,
  type TemplateLayout,
} from "@/lib/template-layout";
import {
  HANDLES,
  hitHandle,
  moveSlots,
  resizeSlot,
  unionBox,
  type HandleId,
} from "@/lib/template-editor";
import { snapRect, type SnapGuide } from "@/lib/template-snap";
import { SlotInspector } from "@/components/dashboard/template-builder/SlotInspector";
import { TemplateTextPanel } from "@/components/dashboard/template-builder/TemplateTextPanel";
import {
  useCanvasViewport,
  ZOOM_MAX,
  ZOOM_MIN,
} from "@/components/dashboard/template-builder/useCanvasViewport";
import { useTemplateHistory } from "@/components/dashboard/template-builder/useTemplateHistory";

export type TemplateLayoutSaveResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export type ChromaDetectAction = () => Promise<{
  layout?: unknown;
  frameUrl?: string | null;
  skipped?: number;
  error?: string;
}>;

export type DuplicateTemplateAction = () => Promise<{
  templateId?: string;
  error?: string;
}>;

type Props = {
  templateName: string;
  initialLayout: TemplateLayout | null;
  initialActive: boolean;
  /** Signed frame URL; drawn ABOVE photos exactly like kiosk. */
  frameUrl?: string | null;
  /** true = platform template bought by owner: no save controls. */
  readOnly?: boolean;
  onSave?: (layout: TemplateLayout, publish: boolean) => Promise<TemplateLayoutSaveResult>;
  /** Deteksi area hijau → slot mask. Dimatikan untuk read-only. */
  onDetectChroma?: ChromaDetectAction;
  /** Duplikat template (frame + layout) menjadi template baru milik owner. */
  onDuplicateTemplate?: DuplicateTemplateAction;
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

type LayoutIssue = { path: string; message: string };

/**
 * Validasi klien memakai `layoutSchema` yang SAMA dengan server (bukan salinan
 * aturan): salinan lokal pernah meloloskan layout yang ditolak server.
 */
function validateLayout(layout: TemplateLayout): LayoutIssue[] {
  const parsed = layoutSchema.safeParse(layout);
  if (parsed.success) return [];
  return parsed.error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "layout",
    message: issue.message,
  }));
}

function nextSlotId(slots: readonly LayoutSlot[], prefix = "slot"): string {
  const ids = new Set(slots.map((s) => s.id));
  let seq = 1;
  while (ids.has(`${prefix}-${seq}`)) seq += 1;
  return `${prefix}-${seq}`;
}

function renumberZ(slots: readonly LayoutSlot[]): LayoutSlot[] {
  return [...slots].sort((a, b) => a.z - b.z).map((slot, index) => ({ ...slot, z: index }));
}

/** Titik (koordinat canvas) → koordinat lokal slot setelah rotasi inverse. */
function toSlotLocal(slot: LayoutSlot, px: number, py: number): { x: number; y: number } {
  const cx = slot.x + slot.width / 2;
  const cy = slot.y + slot.height / 2;
  const rad = (-slot.rotation * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  return {
    x: dx * Math.cos(rad) - dy * Math.sin(rad) + slot.width / 2,
    y: dx * Math.sin(rad) + dy * Math.cos(rad) + slot.height / 2,
  };
}

/** Ray casting point-in-polygon. */
function pointInPolygon(
  points: readonly { x: number; y: number }[],
  px: number,
  py: number
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]!;
    const b = points[j]!;
    if (
      a.y > py !== b.y > py &&
      px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y || Number.EPSILON) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

type DragState =
  | {
      mode: "move";
      ids: string[];
      startX: number;
      startY: number;
      origins: Map<string, { x: number; y: number }>;
      checkpointed: boolean;
    }
  | {
      mode: "resize";
      id: string;
      handle: HandleId;
      startX: number;
      startY: number;
      origin: { x: number; y: number; width: number; height: number };
      checkpointed: boolean;
    }
  | { mode: "pan"; startX: number; startY: number; panX: number; panY: number };

const CURSOR_BY_HANDLE: Record<HandleId, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

export function TemplateBuilderCanvas({
  templateName,
  initialLayout,
  initialActive,
  frameUrl,
  readOnly = false,
  onSave,
  onDetectChroma,
  onDuplicateTemplate,
}: Props) {
  const router = useRouter();
  const uid = useId();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const placeholdersRef = useRef<HTMLCanvasElement[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const frameRef = useRef<HTMLImageElement | null>(null);
  const [frameVersion, setFrameVersion] = useState(0);
  // Frame hasil deteksi menggantikan prop agar preview langsung memakai PNG bersih.
  const [localFrameUrl, setLocalFrameUrl] = useState<string | null>(null);
  const activeFrameUrl = localFrameUrl ?? frameUrl ?? null;
  const [detecting, setDetecting] = useState(false);
  const [confirmDetect, setConfirmDetect] = useState(false);
  const [detectMessage, setDetectMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null
  );

  const initial = useMemo<TemplateLayout>(() => {
    if (initialLayout) {
      const parsed = layoutSchema.safeParse(initialLayout);
      if (parsed.success) return parsed.data;
    }
    return emptyLayout("4x6-portrait");
  }, [initialLayout]);

  const history = useTemplateHistory<TemplateLayout>(initial);
  const layout = history.present;
  const viewport = useCanvasViewport();

  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const first = initial.slots[0];
    return first ? [first.id] : [];
  });
  const [guides, setGuides] = useState<SnapGuide[]>([]);
  const [activeState, setActiveState] = useState(initialActive);
  // Draft hex hanya saat owner mengetik. Tanpa draft, nilai DITURUNKAN dari
  // kanvas — jadi chroma detect/deteksi yang mengganti background otomatis
  // memperbarui input (tanpa effect yang menulis state).
  const [bgDraft, setBgDraft] = useState<string | null>(null);
  const bgInput = bgDraft ?? layout.canvas.background ?? DEFAULT_CANVAS_BACKGROUND;
  const [saveMessage, setSaveMessage] = useState<
    { kind: "ok"; text: string } | { kind: "error"; text: string; fields: string[] } | null
  >(null);
  const [pending, startTransition] = useTransition();
  const [duplicating, startDuplicate] = useTransition();

  const selectedId = selectedIds[selectedIds.length - 1] ?? null;
  const selected = layout.slots.find((slot) => slot.id === selectedId) ?? null;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const issues = readOnly ? [] : validateLayout(layout);
  const invalid = issues.length > 0;
  const issueFor = (path: string) => issues.find((issue) => issue.path === path)?.message;
  const slotIndex = selected ? layout.slots.indexOf(selected) : -1;
  /** Error zod milik field slot terpilih (path `slots.<i>.<field>`). */
  const slotIssue = (field: string) => issueFor(`slots.${slotIndex}.${field}`);

  useEffect(() => {
    frameRef.current = null;
    if (!activeFrameUrl) return;
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
      retry.src = activeFrameUrl;
    };
    img.src = activeFrameUrl;
    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [activeFrameUrl]);

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
    const scale = canvas.width / layout.canvas.width;
    const line = Math.max(2, canvas.width * 0.004);

    ctx.save();
    ctx.strokeStyle = defaultBrandColors.destructive;
    ctx.lineWidth = line;
    ctx.setLineDash([10, 6]);
    for (const slot of ordered) {
      if (!selectedSet.has(slot.id)) continue;
      slotClipPath(ctx, slot, scale);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // Outline grup: satu bbox putus-putus untuk multi-select (>1 slot).
    const selectedSlots = ordered.filter((slot) => selectedSet.has(slot.id));
    if (selectedSlots.length > 1) {
      const box = unionBox(selectedSlots);
      if (box) {
        ctx.save();
        ctx.strokeStyle = defaultBrandColors.ink;
        ctx.lineWidth = line;
        ctx.setLineDash([14, 8]);
        ctx.strokeRect(
          box.left * scale,
          box.top * scale,
          (box.right - box.left) * scale,
          (box.bottom - box.top) * scale
        );
        ctx.restore();
      }
    }

    // 8 handle untuk slot tunggal (mask tidak bisa di-resize: bbox-nya turunan).
    const single = selectedSlots.length === 1 ? selectedSlots[0] : undefined;
    if (single && single.shape !== "mask") {
      const size = Math.max(8, canvas.width * 0.016);
      const cx = (single.x + single.width / 2) * scale;
      const cy = (single.y + single.height / 2) * scale;
      const rad = (single.rotation * Math.PI) / 180;
      const points: { id: HandleId; x: number; y: number }[] = HANDLES.map((id) => {
        const local = {
          nw: { x: -single.width / 2, y: -single.height / 2 },
          n: { x: 0, y: -single.height / 2 },
          ne: { x: single.width / 2, y: -single.height / 2 },
          e: { x: single.width / 2, y: 0 },
          se: { x: single.width / 2, y: single.height / 2 },
          s: { x: 0, y: single.height / 2 },
          sw: { x: -single.width / 2, y: single.height / 2 },
          w: { x: -single.width / 2, y: 0 },
        }[id];
        return {
          id,
          x: cx + (local.x * Math.cos(rad) - local.y * Math.sin(rad)) * scale,
          y: cy + (local.x * Math.sin(rad) + local.y * Math.cos(rad)) * scale,
        };
      });
      for (const handle of points) {
        const hx = handle.x - size / 2;
        const hy = handle.y - size / 2;
        ctx.fillStyle = defaultBrandColors.bg;
        ctx.fillRect(hx, hy, size, size);
        ctx.strokeStyle = defaultBrandColors.ink;
        ctx.lineWidth = 2;
        ctx.strokeRect(hx, hy, size, size);
      }
    }

    // Snap guides.
    if (guides.length > 0) {
      ctx.save();
      ctx.strokeStyle = defaultBrandColors.accent;
      ctx.lineWidth = Math.max(1, canvas.width * 0.002);
      ctx.setLineDash([8, 6]);
      for (const guide of guides) {
        ctx.beginPath();
        if (guide.axis === "x") {
          ctx.moveTo(guide.position * scale, 0);
          ctx.lineTo(guide.position * scale, canvas.height);
        } else {
          ctx.moveTo(0, guide.position * scale);
          ctx.lineTo(canvas.width, guide.position * scale);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [layout, selectedSet, guides, frameVersion, activeFrameUrl]);

  function toLayoutPoint(
    canvas: HTMLCanvasElement,
    clientX: number,
    clientY: number
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * layout.canvas.width,
      y: ((clientY - rect.top) / rect.height) * layout.canvas.height,
    };
  }

  /** Patch slot diskret (satu langkah undo). */
  function patchSlot(id: string, patch: Partial<LayoutSlot>) {
    history.commit({
      ...layout,
      slots: layout.slots.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)),
    });
  }

  function patchProperties(id: string, patch: Partial<EditorProperties>) {
    const slot = layout.slots.find((candidate) => candidate.id === id);
    if (!slot) return;
    const properties: EditorProperties = { ...(slot.properties ?? {}), ...patch };
    // Kunci yang dihapus (undefined) benar-benar dibuang, bukan disimpan
    // sebagai undefined — layout tanpa teks tetap identik byte.
    for (const key of Object.keys(properties) as (keyof EditorProperties)[]) {
      if (properties[key] === undefined) delete properties[key];
    }
    history.commit({
      ...layout,
      slots: layout.slots.map((candidate) =>
        candidate.id === id
          ? Object.keys(properties).length > 0
            ? { ...candidate, properties }
            : (({ properties: _drop, ...rest }) => rest)(candidate)
          : candidate
      ),
    });
  }

  function applyCanvasSize(width: number, height: number, preset: CanvasPreset) {
    const nextW = Math.min(CANVAS_MAX, Math.max(1, Math.round(width)));
    const nextH = Math.min(CANVAS_MAX, Math.max(1, Math.round(height)));
    const canvas = { width: nextW, height: nextH };
    history.commit({
      ...layout,
      canvas: { ...layout.canvas, width: nextW, height: nextH, preset },
      slots: layout.slots.map((slot) => {
        const clamped = clampSlot(slot, canvas);
        if (clamped.shape === "circle") {
          const side = Math.min(clamped.width, clamped.height);
          return { ...clamped, width: side, height: side };
        }
        return clamped;
      }),
    });
  }

  function handlePreset(preset: CanvasPreset) {
    if (preset === "custom") {
      history.commit({ ...layout, canvas: { ...layout.canvas, preset } });
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
    history.commit({ ...layout, slots: [...layout.slots, slot] });
    setSelectedIds([slot.id]);
  }

  function duplicateSlot() {
    if (!selected || readOnly || layout.slots.length >= MAX_SLOTS) return;
    const offset = Math.round(Math.min(layout.canvas.width, layout.canvas.height) * 0.04) || 16;
    const copy: LayoutSlot = clampSlot(
      {
        ...selected,
        id: nextSlotId(layout.slots),
        x: selected.x + offset,
        y: selected.y + offset,
        z: layout.slots.length,
        // Poligon mask milik slot asal; salinan tetap sah karena lokal ke bbox.
        points: selected.points ? selected.points.map((pt) => ({ ...pt })) : undefined,
        properties: selected.properties ? { ...selected.properties } : undefined,
      },
      layout.canvas
    );
    history.commit({ ...layout, slots: [...layout.slots, copy] });
    setSelectedIds([copy.id]);
  }

  function deleteSelection() {
    if (readOnly || selectedIds.length === 0) return;
    const remaining = renumberZ(layout.slots.filter((slot) => !selectedSet.has(slot.id)));
    history.commit({ ...layout, slots: remaining });
    setSelectedIds((prev) => {
      const nextSelection = prev.filter((id) => !selectedSet.has(id));
      return nextSelection.length > 0 ? nextSelection : remaining[0] ? [remaining[0].id] : [];
    });
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
    history.commit({ ...layout, slots: swapped.map((slot, i) => ({ ...slot, z: i })) });
  }

  function setShape(shape: LayoutSlot["shape"]) {
    if (!selected || shape === "mask") return;
    if (shape === "circle") {
      const side = Math.min(selected.width, selected.height);
      patchSlot(selected.id, { shape, width: side, height: side, points: undefined });
      return;
    }
    patchSlot(selected.id, { shape, points: undefined });
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
    const ids = new Set(selectedIds);
    const origins = new Map(layout.slots.map((slot) => [slot.id, { x: slot.x, y: slot.y }]));
    history.commit({
      ...layout,
      slots: moveSlots(layout.slots, ids, dx, dy, layout.canvas, origins),
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    if (readOnly) return;

    // Pan: tombol tengah atau Space+drag.
    if (event.button === 1 || event.altKey) {
      dragRef.current = {
        mode: "pan",
        startX: event.clientX,
        startY: event.clientY,
        panX: viewport.panX,
        panY: viewport.panY,
      };
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
      event.preventDefault();
      return;
    }
    if (layout.slots.length === 0) return;

    const point = toLayoutPoint(canvas, event.clientX, event.clientY);
    const drawScale = canvas.width / layout.canvas.width;
    const tolerance = 18 / Math.max(drawScale * viewport.zoom, 0.0001);

    // Hit-test 8 handle dulu — semua handle, bukan hanya sudut tenggara.
    // Handle digambar mengikuti rotasi slot, jadi titik diuji di ruang LOKAL
    // slot (rotasi inverse) agar semua 8 handle benar-benar bisa dipegang.
    if (selected && selected.shape !== "mask") {
      const local = toSlotLocal(selected, point.x, point.y);
      const handle = hitHandle({ ...selected, x: 0, y: 0 }, local.x, local.y, tolerance);
      if (handle) {
        dragRef.current = {
          mode: "resize",
          id: selected.id,
          handle,
          startX: point.x,
          startY: point.y,
          origin: {
            x: selected.x,
            y: selected.y,
            width: selected.width,
            height: selected.height,
          },
          checkpointed: false,
        };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = CURSOR_BY_HANDLE[handle];
        event.preventDefault();
        return;
      }
    }

    const byZDesc = [...layout.slots].sort((a, b) => b.z - a.z);
    const inBbox = (slot: LayoutSlot) =>
      point.x >= slot.x &&
      point.x <= slot.x + slot.width &&
      point.y >= slot.y &&
      point.y <= slot.y + slot.height;
    const hit =
      byZDesc.find((slot) => {
        if (!inBbox(slot)) return false;
        if (slot.shape !== "mask" || !slot.points) return true;
        const local = toSlotLocal(slot, point.x, point.y);
        return pointInPolygon(slot.points, local.x, local.y);
      }) ?? byZDesc.find(inBbox);
    if (!hit) {
      setSelectedIds([]);
      return;
    }

    // Shift/Ctrl klik = tambah/hapus dari seleksi; tanpa modifier = seleksi
    // tunggal, kecuali slot sudah bagian dari grup (drag grup dipertahankan).
    let ids: string[];
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      ids = selectedSet.has(hit.id)
        ? selectedIds.filter((id) => id !== hit.id)
        : [...selectedIds, hit.id];
      setSelectedIds(ids);
      if (ids.length === 0) return;
    } else if (selectedSet.has(hit.id) && selectedIds.length > 1) {
      ids = selectedIds;
    } else {
      ids = [hit.id];
      setSelectedIds(ids);
    }

    const moving = new Set(ids);
    dragRef.current = {
      mode: "move",
      ids,
      startX: point.x,
      startY: point.y,
      origins: new Map(
        layout.slots
          .filter((slot) => moving.has(slot.id))
          .map((slot) => [slot.id, { x: slot.x, y: slot.y }])
      ),
      checkpointed: false,
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.style.cursor = "grabbing";
    event.preventDefault();
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === "pan") {
      viewport.panBy(event.clientX - drag.startX, event.clientY - drag.startY);
      dragRef.current = {
        ...drag,
        startX: event.clientX,
        startY: event.clientY,
        panX: viewport.panX,
        panY: viewport.panY,
      };
      return;
    }
    const point = toLayoutPoint(event.currentTarget, event.clientX, event.clientY);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;

    // Checkpoint saat gerakan PERTAMA: klik tanpa drag tidak mengotori undo.
    if (!drag.checkpointed && (dx !== 0 || dy !== 0)) {
      history.checkpoint();
      drag.checkpointed = true;
    }

    if (drag.mode === "resize") {
      const slot = layout.slots.find((candidate) => candidate.id === drag.id);
      if (!slot) return;
      // Delta diputar ke ruang lokal slot agar resize benar untuk slot berotasi.
      const rad = (-slot.rotation * Math.PI) / 180;
      const localDx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const localDy = dx * Math.sin(rad) + dy * Math.cos(rad);
      const next = resizeSlot(slot, drag.handle, localDx, localDy, layout.canvas, drag.origin);
      history.replace({
        ...layout,
        slots: layout.slots.map((candidate) => (candidate.id === drag.id ? next : candidate)),
      });
      return;
    }

    let moveX = dx;
    let moveY = dy;
    let nextGuides: SnapGuide[] = [];
    // Snap hanya untuk satu slot: snapping grup ke tepi slot lain membuat
    // seluruh grup "melompat" tanpa alasan yang terlihat.
    if (drag.ids.length === 1) {
      const id = drag.ids[0]!;
      const origin = drag.origins.get(id);
      const slot = layout.slots.find((candidate) => candidate.id === id);
      if (origin && slot) {
        const result = snapRect(
          { x: origin.x + dx, y: origin.y + dy, width: slot.width, height: slot.height },
          layout.slots.filter((candidate) => candidate.id !== id),
          layout.canvas
        );
        moveX = result.x - origin.x;
        moveY = result.y - origin.y;
        nextGuides = result.guides;
      }
    }
    setGuides(nextGuides);
    history.replace({
      ...layout,
      slots: moveSlots(layout.slots, new Set(drag.ids), moveX, moveY, layout.canvas, drag.origins),
    });
  }

  function endDrag(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    setGuides([]);
    event.currentTarget.style.cursor = "";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const undo = useCallback(() => history.undo(), [history]);
  const redo = useCallback(() => history.redo(), [history]);

  // Undo/redo global (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z) + Delete slot terpilih.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      // Jangan bajak shortcut saat fokus di input/textarea (undo teks asli).
      const typing =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "z") {
        if (typing) return;
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (typing) return;
      if (!readOnly && (event.key === "Delete" || event.key === "Backspace")) {
        if (selectedIds.length === 0) return;
        event.preventDefault();
        deleteSelection();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, readOnly, selectedIds, layout, selectedSet]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (readOnly || !selected) return;
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

  function fitToStage() {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const rect = stage.getBoundingClientRect();
    // Ruang untuk padding border + shadow bingkai.
    viewport.fit(layout.canvas, {
      width: Math.max(1, rect.width - 32),
      height: Math.max(1, rect.height - 32),
    });
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
      // Badge status diturunkan ulang dari hasil simpan, bukan dari prop awal:
      // publish/draft terakhir harus langsung terlihat tanpa reload.
      setActiveState(publish);
      setSaveMessage({ kind: "ok", text: `Tersimpan (${publish ? "publish" : "draft"})` });
      router.refresh();
    });
  }

  function duplicateTemplate() {
    if (!onDuplicateTemplate || duplicating) return;
    startDuplicate(async () => {
      const result = await onDuplicateTemplate();
      if (result.error || !result.templateId) {
        setSaveMessage({
          kind: "error",
          text: result.error ?? "Gagal menduplikasi template.",
          fields: [],
        });
        return;
      }
      router.push(`/dashboard/templates/builder/${result.templateId}`);
    });
  }

  const canEdit = !readOnly;
  const sortedSlots = [...layout.slots].sort((a, b) => a.z - b.z);

  async function runDetect() {
    if (!onDetectChroma || readOnly || detecting) return;
    // Dua tahap bila sudah ada slot: deteksi menambah slot baru.
    if (layout.slots.length > 0 && !confirmDetect) {
      setConfirmDetect(true);
      setDetectMessage(null);
      return;
    }
    setConfirmDetect(false);
    setDetecting(true);
    setDetectMessage(null);
    const result = await onDetectChroma();
    setDetecting(false);
    if (result.error || !result.layout) {
      setDetectMessage({ kind: "error", text: result.error ?? "Deteksi gagal." });
      return;
    }
    const parsed = layoutSchema.safeParse(result.layout);
    if (!parsed.success) {
      setDetectMessage({ kind: "error", text: "Layout hasil deteksi tidak valid." });
      return;
    }
    history.commit(parsed.data);
    // Kanvas hasil deteksi membawa background baru — buang draft hex agar
    // input menampilkan nilai deteksi.
    setBgDraft(null);
    setSelectedIds((prev) => {
      const alive = prev.filter((id) => parsed.data.slots.some((slot) => slot.id === id));
      return alive.length > 0 ? alive : parsed.data.slots[0] ? [parsed.data.slots[0].id] : [];
    });
    if (result.frameUrl) {
      frameRef.current = null;
      setLocalFrameUrl(result.frameUrl);
      setFrameVersion((v) => v + 1);
    }
    const skipped = result.skipped ?? 0;
    const created = parsed.data.slots.length - layout.slots.length;
    setDetectMessage({
      kind: "ok",
      text:
        skipped > 0
          ? `${created} slot dibuat · ${skipped} area dilewati (batas ${MAX_SLOTS} slot)`
          : `${created} slot mask dibuat`,
    });
  }

  const slotNumber = selected ? layout.slots.findIndex((slot) => slot.id === selected.id) + 1 : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={
            activeState
              ? "border-2 border-ink bg-ink px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-bg"
              : "border-2 border-ink bg-muted px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink"
          }
        >
          {activeState ? "AKTIF" : "DRAFT"}
        </span>
        {readOnly && (
          <span className="border-2 border-destructive bg-destructive/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-ink">
            TEMPLATE PLATFORM — READ-ONLY
          </span>
        )}
        {canEdit && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={undo}
              disabled={!history.canUndo}
              aria-label="Undo (Cmd/Ctrl+Z)"
              title="Undo (Cmd/Ctrl+Z)"
            >
              <Undo2 aria-hidden />
              Undo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={redo}
              disabled={!history.canRedo}
              aria-label="Redo (Shift+Cmd/Ctrl+Z)"
              title="Redo (Shift+Cmd/Ctrl+Z)"
            >
              <Redo2 aria-hidden />
              Redo
            </Button>
            {onDuplicateTemplate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={duplicateTemplate}
                disabled={duplicating}
                aria-label="Duplikat template jadi template baru"
              >
                <CopyPlus aria-hidden />
                {duplicating ? "Menduplikasi…" : "Duplikat template"}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="flex flex-col gap-3" aria-label="Preview template">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={viewport.zoomOut}
              disabled={viewport.zoom <= ZOOM_MIN}
              aria-label="Perkecil tampilan"
            >
              <ZoomOut aria-hidden />
            </Button>
            <span className="min-w-16 border-2 border-ink bg-muted px-2 py-1 text-center font-mono text-[11px] font-bold tabular-nums">
              {`${Math.round(viewport.zoom * 100)}%`}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={viewport.zoomIn}
              disabled={viewport.zoom >= ZOOM_MAX}
              aria-label="Perbesar tampilan"
            >
              <ZoomIn aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={fitToStage}
              aria-label="Sesuaikan ke layar"
            >
              <Maximize aria-hidden />
              Fit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={viewport.reset}
              aria-label="Kembalikan zoom 100%"
            >
              100%
            </Button>
          </div>
          <div
            ref={stageRef}
            className="relative flex max-h-[60vh] items-center justify-center overflow-hidden border-2 border-ink bg-muted p-2"
          >
            <div
              role="application"
              tabIndex={0}
              aria-label={`Preview template ${templateName}. Panah menggeser slot, Shift 10 piksel. Alt+drag menggeser tampilan, zoom ${Math.round(viewport.zoom * 100)} persen.`}
              onKeyDown={handleKeyDown}
              className="w-fit max-w-full border-2 border-ink bg-bg p-2 shadow-hard outline-none focus-visible:ring-2 focus-visible:ring-ink"
              style={{ transform: `translate(${viewport.panX}px, ${viewport.panY}px)` }}
            >
              <canvas
                ref={canvasRef}
                className="block h-auto w-auto touch-none border-2 border-ink bg-ink"
                style={{
                  maxWidth: `min(100%, ${PREVIEW_MAX_W * viewport.zoom}px)`,
                  maxHeight: `calc(60vh * ${viewport.zoom})`,
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onPointerLeave={endDrag}
                onContextMenu={(event) => event.preventDefault()}
                aria-hidden="true"
              />
            </div>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            {layout.slots.length === 0
              ? "Belum ada slot. Frame tampil penuh (legacy) sampai Anda menambah slot."
              : `${layout.slots.length} slot · ${selectedIds.length} terpilih · kanvas ${layout.canvas.width}x${layout.canvas.height}`}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Shift+klik untuk multi-pilih · Delete hapus slot · Alt+drag geser tampilan
          </p>
        </section>

        <section className="flex min-w-0 flex-col gap-5" aria-label="Kontrol layout">
          <div className="flex flex-col gap-2">
            <p className={labelClass}>
              Slot ({layout.slots.length}/{MAX_SLOTS})
            </p>
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
                      aria-pressed={selectedSet.has(slot.id)}
                      aria-label={`Pilih ${slot.id}, bentuk ${slot.shape}, z ${slot.z}`}
                      onClick={(event) =>
                        setSelectedIds((prev) => {
                          if (!event.shiftKey && !event.metaKey && !event.ctrlKey) return [slot.id];
                          return prev.includes(slot.id)
                            ? prev.filter((id) => id !== slot.id)
                            : [...prev, slot.id];
                        })
                      }
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
              <div className="flex flex-wrap gap-2">
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
                {selected && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label="Duplikat slot terpilih"
                    onClick={duplicateSlot}
                    disabled={layout.slots.length >= MAX_SLOTS}
                  >
                    <Copy aria-hidden />
                    Duplikat slot
                  </Button>
                )}
              </div>
            )}
          </div>

          {canEdit && selected && (
            <>
              <SlotInspector
                uid={uid}
                slot={selected}
                slotNumber={slotNumber}
                canEdit={canEdit}
                onPatch={(patch) => patchSlot(selected.id, patch)}
                onShape={setShape}
                onWidth={setWidth}
                onHeight={setHeight}
                onDelete={deleteSelection}
                onDuplicate={duplicateSlot}
                onMoveZ={moveZ}
                fieldIssue={slotIssue}
              />
              <TemplateTextPanel
                uid={uid}
                slot={selected}
                canEdit={canEdit}
                onPatchProperties={(patch) => patchProperties(selected.id, patch)}
              />
            </>
          )}

          {canEdit && (
            <div className="flex flex-col gap-4 border-2 border-ink bg-surface p-3 shadow-hard">
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

              <div className="flex flex-col gap-2 border-2 border-ink/20 bg-muted p-3">
                <p className={labelClass}>Deteksi area hijau</p>
                <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.06em] text-muted-foreground">
                  Hijau dihapus dari frame dan diganti slot foto. File asli disimpan untuk deteksi
                  ulang.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    aria-label="Deteksi area hijau frame"
                    onClick={() => void runDetect()}
                    disabled={!onDetectChroma || detecting}
                  >
                    {detecting
                      ? "Mendeteksi…"
                      : confirmDetect
                        ? "Yakin? Klik lagi"
                        : "Deteksi area hijau"}
                  </Button>
                  {confirmDetect && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="Batalkan deteksi"
                      onClick={() => setConfirmDetect(false)}
                    >
                      Batal
                    </Button>
                  )}
                </div>
                {detectMessage && (
                  <p
                    role={detectMessage.kind === "error" ? "alert" : "status"}
                    className={
                      detectMessage.kind === "error"
                        ? "font-mono text-[10px] uppercase tracking-[0.06em] text-destructive"
                        : "font-mono text-[10px] uppercase tracking-[0.06em] text-ink"
                    }
                  >
                    {detectMessage.text}
                  </p>
                )}
              </div>

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
                    aria-invalid={Boolean(issueFor("canvas.width"))}
                  />
                  {issueFor("canvas.width") && (
                    <p role="alert" className="font-mono text-[10px] uppercase text-destructive">
                      {issueFor("canvas.width")}
                    </p>
                  )}
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
                    aria-invalid={Boolean(issueFor("canvas.height"))}
                  />
                  {issueFor("canvas.height") && (
                    <p role="alert" className="font-mono text-[10px] uppercase text-destructive">
                      {issueFor("canvas.height")}
                    </p>
                  )}
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
                      setBgDraft(value);
                      history.commit({
                        ...layout,
                        canvas: { ...layout.canvas, background: value },
                      });
                    }}
                    aria-label="Warna background kanvas"
                    className="h-11 w-20 cursor-pointer border-2 border-ink bg-surface p-1 shadow-hard-sm focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
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
                      setBgDraft(value);
                      if (HEX.test(value)) {
                        history.replace({
                          ...layout,
                          canvas: { ...layout.canvas, background: value },
                        });
                      }
                    }}
                    onBlur={() => {
                      // Hex tidak valid ditinggalkan → kembali ke nilai kanvas.
                      if (!HEX.test(bgInput)) setBgDraft(null);
                    }}
                    aria-invalid={!HEX.test(bgInput) || Boolean(issueFor("canvas.background"))}
                    placeholder="#ffffff"
                  />
                  {!HEX.test(bgInput) ? (
                    <p className="font-mono text-[10px] uppercase text-destructive">
                      Hex harus format #rrggbb
                    </p>
                  ) : (
                    issueFor("canvas.background") && (
                      <p role="alert" className="font-mono text-[10px] uppercase text-destructive">
                        {issueFor("canvas.background")}
                      </p>
                    )
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
                    {`${issues.length} masalah layout — simpan dinonaktifkan`}
                  </p>
                  <ul className="mt-2 flex list-inside list-disc flex-col gap-1 font-mono text-[11px] text-ink">
                    {issues.map((issue) => (
                      <li key={`${issue.path}-${issue.message}`}>
                        {`${issue.path}: ${issue.message}`}
                      </li>
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
