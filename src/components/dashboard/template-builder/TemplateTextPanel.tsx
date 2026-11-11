"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LABEL_CLASS as labelClass } from "@/lib/form-ui";
import {
  PROPERTY_ALIGNMENTS,
  PROPERTY_FONT_WEIGHTS,
  type EditorProperties,
  type LayoutSlot,
} from "@/lib/template-layout";

type Props = {
  uid: string;
  slot: LayoutSlot;
  canEdit: boolean;
  onPatchProperties: (patch: Partial<EditorProperties>) => void;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

const toNumber = (value: string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Layer teks slot — mengisi `slot.properties`. Field yang kosong TIDAK ditulis
 * (bukan undefined-key) supaya layout tanpa teks tetap identik byte.
 */
export function TemplateTextPanel({ uid, slot, canEdit, onPatchProperties }: Props) {
  const props = slot.properties ?? {};
  return (
    <fieldset
      className="flex flex-col gap-3 border-2 border-ink bg-surface p-3"
      disabled={!canEdit}
    >
      <legend className={labelClass}>Layer teks</legend>
      <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.06em] text-muted-foreground">
        Teks digambar di atas frame pada JPEG final. Kosongkan untuk menyembunyikan.
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-text`} className={labelClass}>
          Teks
        </label>
        <textarea
          id={`${uid}-text`}
          value={props.text ?? ""}
          rows={2}
          maxLength={2000}
          onChange={(event) => onPatchProperties({ text: event.target.value || undefined })}
          className="w-full resize-y rounded-none border-2 border-ink bg-surface px-2.5 py-2 font-mono text-sm text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ink"
          placeholder="cth. SNAPYOS 2026"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-font`} className={labelClass}>
            Font
          </label>
          <Select
            id={`${uid}-font`}
            value={props.fontFamily ?? "display"}
            onChange={(event) =>
              onPatchProperties({
                fontFamily: event.target.value as EditorProperties["fontFamily"],
              })
            }
          >
            <option value="display">DISPLAY</option>
            <option value="sans">SANS</option>
            <option value="mono">MONO</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-weight`} className={labelClass}>
            Weight
          </label>
          <Select
            id={`${uid}-weight`}
            value={String(props.fontWeight ?? 700)}
            onChange={(event) => onPatchProperties({ fontWeight: Number(event.target.value) })}
          >
            {PROPERTY_FONT_WEIGHTS.map((weight) => (
              <option key={weight} value={weight}>
                {weight}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-size`} className={labelClass}>
            Size
          </label>
          <Input
            id={`${uid}-size`}
            type="number"
            min={8}
            max={240}
            step={1}
            value={props.fontSize ?? 32}
            onChange={(event) =>
              onPatchProperties({ fontSize: toNumber(event.target.value, props.fontSize ?? 32) })
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-leading`} className={labelClass}>
            Line height
          </label>
          <Input
            id={`${uid}-leading`}
            type="number"
            min={0.8}
            max={3}
            step={0.05}
            value={props.lineHeight ?? 1.2}
            onChange={(event) =>
              onPatchProperties({
                lineHeight: toNumber(event.target.value, props.lineHeight ?? 1.2),
              })
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-tracking`} className={labelClass}>
            Letter spacing
          </label>
          <Input
            id={`${uid}-tracking`}
            type="number"
            min={-0.2}
            max={2}
            step={0.01}
            value={props.letterSpacing ?? 0}
            onChange={(event) => {
              const value = toNumber(event.target.value, 0);
              // 0 = default: hapus key agar layout tanpa teks tetap identik.
              onPatchProperties({ letterSpacing: value === 0 ? undefined : value });
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-opacity`} className={labelClass}>
            Opacity
          </label>
          <Input
            id={`${uid}-opacity`}
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={props.opacity ?? 1}
            onChange={(event) => {
              const value = Math.min(1, Math.max(0, toNumber(event.target.value, 1)));
              onPatchProperties({ opacity: value === 1 ? undefined : value });
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-text-color`} className={labelClass}>
            Warna teks
          </label>
          <input
            id={`${uid}-text-color`}
            type="color"
            value={HEX.test(props.color ?? "") ? props.color! : "#111111"}
            onChange={(event) => onPatchProperties({ color: event.target.value })}
            className="h-11 w-full cursor-pointer border-2 border-ink bg-surface p-1 focus-visible:ring-2 focus-visible:ring-ink focus-visible:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-text-align`} className={labelClass}>
            Alignment
          </label>
          <Select
            id={`${uid}-text-align`}
            value={props.alignment ?? "center"}
            onChange={(event) =>
              onPatchProperties({
                alignment: event.target.value as EditorProperties["alignment"],
              })
            }
          >
            {PROPERTY_ALIGNMENTS.map((alignment) => (
              <option key={alignment} value={alignment}>
                {alignment.toUpperCase()}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </fieldset>
  );
}
