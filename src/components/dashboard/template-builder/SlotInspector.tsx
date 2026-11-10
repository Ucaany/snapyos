"use client";

import { ArrowDown, ArrowUp, Copy, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LABEL_CLASS as labelClass } from "@/lib/form-ui";
import { SLOT_FITS, SLOT_SHAPES, type LayoutSlot } from "@/lib/template-layout";

type Props = {
  uid: string;
  slot: LayoutSlot;
  slotNumber: number;
  canEdit: boolean;
  onPatch: (patch: Partial<LayoutSlot>) => void;
  onShape: (shape: LayoutSlot["shape"]) => void;
  onWidth: (value: number) => void;
  onHeight: (value: number) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveZ: (direction: -1 | 1) => void;
  /** Pesan error per-field dari `layoutSchema` (path zod → pesan). */
  fieldIssue?: (field: string) => string | undefined;
};

const toNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Panel properti slot terpilih — geometri, bentuk, fit, urutan z. */
export function SlotInspector({
  uid,
  slot,
  slotNumber,
  canEdit,
  onPatch,
  onShape,
  onWidth,
  onHeight,
  onDelete,
  onDuplicate,
  onMoveZ,
  fieldIssue,
}: Props) {
  const isMask = slot.shape === "mask";
  const err = (field: string) => fieldIssue?.(field);
  const errorText = (message: string | undefined) =>
    message ? (
      <p role="alert" className="font-mono text-[10px] uppercase text-destructive">
        {message}
      </p>
    ) : null;
  return (
    <div className="flex flex-col gap-4 border-2 border-ink bg-surface p-3 shadow-hard">
      <p className={labelClass}>{`Slot terpilih: #${slotNumber} · ${slot.id}`}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          aria-label="Hapus slot terpilih"
          onClick={onDelete}
          disabled={!canEdit}
        >
          <Trash2 aria-hidden />
          Hapus slot
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Duplikat slot terpilih"
          onClick={onDuplicate}
          disabled={!canEdit}
        >
          <Copy aria-hidden />
          Duplikat
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Naikkan z slot terpilih"
          onClick={() => onMoveZ(1)}
          disabled={!canEdit}
        >
          <ArrowUp aria-hidden />
          Naikkan z
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Turunkan z slot terpilih"
          onClick={() => onMoveZ(-1)}
          disabled={!canEdit}
        >
          <ArrowDown aria-hidden />
          Turunkan z
        </Button>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={!canEdit}>
        <legend className={labelClass}>Bentuk</legend>
        <div className="flex flex-wrap gap-2">
          {SLOT_SHAPES.filter((shape) => shape !== "mask").map((shape) => (
            <Button
              key={shape}
              type="button"
              size="sm"
              variant={slot.shape === shape ? "default" : "outline"}
              aria-label={`Bentuk ${shape}`}
              aria-pressed={slot.shape === shape}
              onClick={() => onShape(shape)}
            >
              {shape}
            </Button>
          ))}
        </div>
        {isMask && (
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Slot mask hanya lahir dari deteksi area hijau.
          </p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2" disabled={!canEdit}>
        <legend className={labelClass}>Fit foto</legend>
        <div className="flex flex-wrap gap-2">
          {SLOT_FITS.map((fit) => (
            <Button
              key={fit}
              type="button"
              size="sm"
              variant={(slot.fit ?? "cover") === fit ? "default" : "outline"}
              aria-label={`Fit ${fit}`}
              aria-pressed={(slot.fit ?? "cover") === fit}
              onClick={() => onPatch({ fit })}
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
            value={slot.x}
            disabled={!canEdit}
            onChange={(event) => onPatch({ x: toNumber(event.target.value, slot.x) })}
            aria-invalid={Boolean(err("x"))}
          />
          {errorText(err("x"))}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-y`} className={labelClass}>
            Y
          </label>
          <Input
            id={`${uid}-y`}
            type="number"
            step={1}
            value={slot.y}
            disabled={!canEdit}
            onChange={(event) => onPatch({ y: toNumber(event.target.value, slot.y) })}
            aria-invalid={Boolean(err("y"))}
          />
          {errorText(err("y"))}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-w`} className={labelClass}>
            Width
          </label>
          <Input
            id={`${uid}-w`}
            type="number"
            step={1}
            value={slot.width}
            disabled={!canEdit || isMask}
            onChange={(event) => onWidth(toNumber(event.target.value, slot.width))}
            aria-invalid={Boolean(err("width"))}
          />
          {errorText(err("width"))}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-h`} className={labelClass}>
            Height
          </label>
          <Input
            id={`${uid}-h`}
            type="number"
            step={1}
            value={slot.height}
            disabled={!canEdit || isMask}
            onChange={(event) => onHeight(toNumber(event.target.value, slot.height))}
            aria-invalid={Boolean(err("height"))}
          />
          {errorText(err("height"))}
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
            max={Math.floor(Math.min(slot.width, slot.height) / 2)}
            value={slot.radius ?? 0}
            disabled={!canEdit || isMask}
            onChange={(event) =>
              onPatch({ radius: Math.max(0, toNumber(event.target.value, slot.radius ?? 0)) })
            }
            aria-invalid={Boolean(err("radius"))}
          />
          {errorText(err("radius"))}
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
            value={slot.rotation}
            disabled={!canEdit}
            onChange={(event) => onPatch({ rotation: toNumber(event.target.value, slot.rotation) })}
            aria-invalid={Boolean(err("rotation"))}
          />
          {errorText(err("rotation"))}
        </div>
      </div>
    </div>
  );
}
