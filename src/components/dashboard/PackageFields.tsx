import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select } from "@/components/ui/select";
import { LABEL_CLASS as labelClass, fieldError } from "@/lib/form-ui";
import type { PackageRow } from "@/server/packages";
import type { FormState } from "@/server/auth-actions";

export type PackageRef = { id: string; name: string };

/**
 * Field-set paket untuk form create/edit. Stateless.
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
          aria-invalid={Boolean(fieldError(state, "name"))}
        />
        {fieldError(state, "name") && (
          <p role="alert" className="font-mono text-xs text-destructive">
            {fieldError(state, "name")}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pkg-price-${id}`} className={labelClass}>
          Harga (IDR) *
        </label>
        <Input
          id={`pkg-price-${id}`}
          name="price"
          type="number"
          min={1}
          step={1}
          required
          defaultValue={pkg?.price}
          placeholder="35000"
          disabled={pending}
          aria-invalid={Boolean(fieldError(state, "price"))}
        />
        {fieldError(state, "price") && (
          <p role="alert" className="font-mono text-xs text-destructive">
            {fieldError(state, "price")}
          </p>
        )}
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
          defaultValue={pkg?.photo_count ?? 1}
          disabled={pending}
        />
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
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pkg-mode-${id}`} className={labelClass}>
          Mode capture
        </label>
        <Select
          id={`pkg-mode-${id}`}
          name="capture_mode"
          defaultValue={pkg?.capture_mode ?? "single"}
          disabled={pending}
        >
          <option value="single">SINGLE</option>
          <option value="burst">BURST</option>
          <option value="photostrip">PHOTOSTRIP</option>
        </Select>
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
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pkg-templates-${id}`} className={labelClass}>
          Pilih satu atau beberapa template. Di komputer gunakan Ctrl/Cmd + klik, di ponsel ketuk pilihan satu per satu.
        </label>
        <MultiSelect
          id={`pkg-templates-${id}`}
          name="template_ids"
          options={templates}
          defaults={pkg?.template_ids ?? []}
          disabled={pending}
        />
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
        />
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
        />
      </div>
      <fieldset className="flex flex-wrap items-center gap-6 border-2 border-ink/10 p-3">
        <legend className={labelClass}>Opsi</legend>
        <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.05em]">
          <input type="checkbox" name="digital_output" defaultChecked={pkg?.digital_output} disabled={pending} className="size-4 accent-[#111111]" />
          Digital copy
        </label>
        <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.05em]">
          <input type="checkbox" name="is_active" defaultChecked={pkg?.is_active ?? true} disabled={pending} className="size-4 accent-[#111111]" />
          Aktif
        </label>
      </fieldset>
    </div>
  );
}
