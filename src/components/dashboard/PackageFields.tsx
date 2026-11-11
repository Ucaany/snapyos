import { useState } from "react";
import { Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select } from "@/components/ui/select";
import { LABEL_CLASS as labelClass, fieldErrors, IDR_PRICE_FLOOR } from "@/lib/form-ui";
import { autoAssignTemplateIds } from "@/lib/template-select";
import type { PackageRow } from "@/server/packages";
import type { FormState } from "@/server/auth-actions";

/** `slotCount` = jumlah slot layout template (0 = legacy tanpa slot). */
export type PackageRef = { id: string; name: string; slotCount?: number };

function FieldError({ state, field, id }: { state: FormState; field: string; id: string }) {
  const messages = fieldErrors(state, field);
  if (messages.length === 0) return null;
  return (
    <div id={id} role="alert" className="flex flex-col gap-1">
      {messages.map((message) => (
        <p key={message} className="font-mono text-xs uppercase tracking-[0.05em] text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}

/**
 * Field-set paket untuk form create/edit. Stateless kecuali assignment template
 * (controlled, supaya tombol "Assign otomatis" bisa mengisi pilihan).
 */
export function PackageFields({
  templates,
  outlets,
  photoboxes,
  pkg,
  state,
  pending,
}: {
  templates: PackageRef[];
  outlets: PackageRef[];
  photoboxes: PackageRef[];
  pkg?: PackageRow;
  state: FormState;
  pending: boolean;
}) {
  const id = pkg?.id ?? "new";
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>(pkg?.template_ids ?? []);
  // photo_count + capture_mode ikut controlled: "Assign otomatis" harus memakai
  // nilai yang sedang diketik, bukan nilai tersimpan.
  const [photoCount, setPhotoCount] = useState(String(pkg?.photo_count ?? 1));
  const [captureMode, setCaptureMode] = useState(pkg?.capture_mode ?? "single");

  const err = (field: string) => ({
    "aria-invalid": fieldErrors(state, field).length > 0,
    "aria-describedby": fieldErrors(state, field).length > 0 ? `pkg-${field}-err-${id}` : undefined,
  });

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label htmlFor={`pkg-name-${id}`} className={labelClass}>
          Nama paket *
        </label>
        <Input
          id={`pkg-name-${id}`}
          name="name"
          required
          defaultValue={pkg?.name}
          placeholder="cth. PREMIUM"
          disabled={pending}
          {...err("name")}
        />
        <FieldError state={state} field="name" id={`pkg-name-err-${id}`} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pkg-price-${id}`} className={labelClass}>
          Harga (IDR) *
        </label>
        <Input
          id={`pkg-price-${id}`}
          name="price"
          type="number"
          min={IDR_PRICE_FLOOR}
          step={1000}
          required
          defaultValue={pkg?.price}
          placeholder="35000"
          disabled={pending}
          {...err("price")}
        />
        <FieldError state={state} field="price" id={`pkg-price-err-${id}`} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pkg-photo-${id}`} className={labelClass}>
          Jumlah foto *
        </label>
        <Input
          id={`pkg-photo-${id}`}
          name="photo_count"
          type="number"
          min={1}
          step={1}
          required
          value={photoCount}
          onChange={(event) => setPhotoCount(event.target.value)}
          disabled={pending}
          {...err("photo_count")}
        />
        <FieldError state={state} field="photo_count" id={`pkg-photo-err-${id}`} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pkg-print-${id}`} className={labelClass}>
          Jumlah cetak
        </label>
        <Input
          id={`pkg-print-${id}`}
          name="print_count"
          type="number"
          min={0}
          step={1}
          defaultValue={pkg?.print_count ?? 0}
          disabled={pending}
          {...err("print_count")}
        />
        <FieldError state={state} field="print_count" id={`pkg-print-err-${id}`} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pkg-mode-${id}`} className={labelClass}>
          Mode capture
        </label>
        <Select
          id={`pkg-mode-${id}`}
          name="capture_mode"
          value={captureMode}
          onChange={(event) => setCaptureMode(event.target.value)}
          disabled={pending}
          {...err("capture_mode")}
        >
          <option value="single">SINGLE</option>
          <option value="burst">BURST</option>
          <option value="photostrip">PHOTOSTRIP</option>
        </Select>
        <FieldError state={state} field="capture_mode" id={`pkg-mode-err-${id}`} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pkg-desc-${id}`} className={labelClass}>
          Deskripsi
        </label>
        <Input
          id={`pkg-desc-${id}`}
          name="description"
          defaultValue={pkg?.description ?? ""}
          placeholder="5 foto + 2 cetak + digital"
          disabled={pending}
          {...err("description")}
        />
        <FieldError state={state} field="description" id={`pkg-desc-err-${id}`} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pkg-templates-${id}`} className={labelClass}>
          Pilih satu atau beberapa template. Di komputer gunakan Ctrl/Cmd + klik, di ponsel ketuk
          pilihan satu per satu.
        </label>
        <MultiSelect
          id={`pkg-templates-${id}`}
          name="template_ids"
          options={templates}
          value={selectedTemplates}
          onChange={setSelectedTemplates}
          disabled={pending}
          ariaInvalid={fieldErrors(state, "template_ids").length > 0}
        />
        <FieldError state={state} field="template_ids" id={`pkg-templates-err-${id}`} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || templates.length === 0}
            aria-label="Assign template secara otomatis"
            onClick={() =>
              setSelectedTemplates(
                autoAssignTemplateIds(
                  templates.map((t) => ({ id: t.id, slotCount: t.slotCount ?? 0 })),
                  {
                    photoCount: Number(photoCount) || 1,
                    captureMode,
                  }
                )
              )
            }
          >
            <Wand2 aria-hidden />
            Assign otomatis
          </Button>
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            {`${selectedTemplates.length} template terpilih`}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pkg-outlets-${id}`} className={labelClass}>
          Outlet berlaku (kosong = semua)
        </label>
        <MultiSelect
          id={`pkg-outlets-${id}`}
          name="outlet_ids"
          options={outlets}
          defaults={pkg?.outlet_ids ?? []}
          disabled={pending}
          ariaInvalid={fieldErrors(state, "outlet_ids").length > 0}
        />
        <FieldError state={state} field="outlet_ids" id={`pkg-outlets-err-${id}`} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pkg-boxes-${id}`} className={labelClass}>
          Photobox berlaku (kosong = semua)
        </label>
        <MultiSelect
          id={`pkg-boxes-${id}`}
          name="photobox_ids"
          options={photoboxes}
          defaults={pkg?.photobox_ids ?? []}
          disabled={pending}
          ariaInvalid={fieldErrors(state, "photobox_ids").length > 0}
        />
        <FieldError state={state} field="photobox_ids" id={`pkg-boxes-err-${id}`} />
      </div>
      <fieldset className="flex flex-wrap items-center gap-6 border-2 border-ink/10 p-3">
        <legend className={labelClass}>Opsi</legend>
        <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.05em]">
          <input
            type="checkbox"
            name="digital_output"
            defaultChecked={pkg?.digital_output}
            disabled={pending}
            className="size-4 accent-[#111111]"
          />
          Digital copy
        </label>
        <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.05em]">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={pkg?.is_active ?? true}
            disabled={pending}
            className="size-4 accent-[#111111]"
          />
          Aktif
        </label>
        <FieldError state={state} field="is_active" id={`pkg-active-err-${id}`} />
      </fieldset>
    </div>
  );
}
