import { useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select } from "@/components/ui/select";
import { LABEL_CLASS as labelClass, fieldErrors, IDR_PRICE_FLOOR } from "@/lib/form-ui";
import { formatIDR } from "@/lib/dashboard-math";
import type { PackageRow } from "@/server/packages";
import type { FormState } from "@/server/auth-actions";

export type PackageRef = { id: string; name: string };

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

function Block({ step, title, hint, children }: {
  step: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-2 border-ink/15 p-4 md:p-5">
      <header className="flex flex-wrap items-baseline gap-2 border-b-2 border-ink/10 pb-2">
        <span className="border-2 border-ink bg-ink px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.12em] text-bg">
          {step}
        </span>
        <h3 className="font-mono text-xs font-bold uppercase tracking-[0.15em]">{title}</h3>
        {hint && (
          <p className="w-full font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground">
            {hint}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

/**
 * Field-set paket (create/edit) dalam satu halaman, 3 blok berurutan.
 * Semua input controlled supaya ringkasan live memakai nilai yang SEDANG
 * diketik, bukan nilai tersimpan. Multi-select template dihapus 2026-11-11:
 * semua template aktif otomatis tersedia di setiap paket.
 */
export function PackageFields({
  templateCount,
  outlets,
  photoboxes,
  pkg,
  state,
  pending,
}: {
  templateCount: number;
  outlets: PackageRef[];
  photoboxes: PackageRef[];
  pkg?: PackageRow;
  state: FormState;
  pending: boolean;
}) {
  const id = pkg?.id ?? "new";
  const [name, setName] = useState(pkg?.name ?? "");
  const [price, setPrice] = useState(pkg ? String(pkg.price) : "");
  const [photoCount, setPhotoCount] = useState(String(pkg?.photo_count ?? 1));
  const [printCount, setPrintCount] = useState(String(pkg?.print_count ?? 0));
  const [captureMode, setCaptureMode] = useState(pkg?.capture_mode ?? "single");
  const [description, setDescription] = useState(pkg?.description ?? "");
  const [digitalOutput, setDigitalOutput] = useState(pkg?.digital_output ?? false);
  const [outletIds, setOutletIds] = useState<string[]>(pkg?.outlet_ids ?? []);
  const [photoboxIds, setPhotoboxIds] = useState<string[]>(pkg?.photobox_ids ?? []);

  const err = (field: string) => ({
    "aria-invalid": fieldErrors(state, field).length > 0,
    "aria-describedby": fieldErrors(state, field).length > 0 ? `pkg-${field}-err-${id}` : undefined,
  });

  const priceNumber = Number(price);
  const availability =
    outletIds.length === 0 && photoboxIds.length === 0
      ? "Semua outlet & booth"
      : `${outletIds.length || "semua"} outlet · ${photoboxIds.length || "semua"} booth`;

  return (
    <div className="flex flex-col gap-5">
      <Block step="01" title="Harga & Isi" hint="Menentukan nominal checkout dan hasil sesi.">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor={`pkg-name-${id}`} className={labelClass}>
              Nama paket *
            </label>
            <Input
              id={`pkg-name-${id}`}
              name="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
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
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="35000"
              disabled={pending}
              {...err("price")}
            />
            <FieldError state={state} field="price" id={`pkg-price-err-${id}`} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={`pkg-photo-${id}`} className={labelClass}>
              Jumlah foto cadangan *
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
            <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.05em] text-muted-foreground">
              Dipakai hanya oleh frame lama tanpa slot. Frame ber-slot menentukan jumlah foto
              sendiri.
            </p>
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
              value={printCount}
              onChange={(event) => setPrintCount(event.target.value)}
              disabled={pending}
              {...err("print_count")}
            />
            <FieldError state={state} field="print_count" id={`pkg-print-err-${id}`} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={`pkg-mode-${id}`} className={labelClass}>
              Mode capture (frame lama)
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
            <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.05em] text-muted-foreground">
              Hanya berlaku saat customer memilih Tanpa frame atau frame legacy.
            </p>
            <FieldError state={state} field="capture_mode" id={`pkg-mode-err-${id}`} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={`pkg-desc-${id}`} className={labelClass}>
              Deskripsi
            </label>
            <Input
              id={`pkg-desc-${id}`}
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="5 foto + 2 cetak + digital"
              disabled={pending}
              {...err("description")}
            />
            <FieldError state={state} field="description" id={`pkg-desc-err-${id}`} />
          </div>
        </div>
        <fieldset className="flex flex-wrap items-center gap-6 border-2 border-ink/10 p-3">
          <legend className={labelClass}>Opsi</legend>
          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.05em]">
            <input
              type="checkbox"
              name="digital_output"
              checked={digitalOutput}
              onChange={(event) => setDigitalOutput(event.target.checked)}
              disabled={pending}
              className="size-4 accent-ink"
            />
            Digital copy
          </label>
          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.05em]">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={pkg?.is_active ?? true}
              disabled={pending}
              className="size-4 accent-ink"
            />
            Aktif
          </label>
          <FieldError state={state} field="is_active" id={`pkg-active-err-${id}`} />
        </fieldset>
      </Block>

      <Block
        step="02"
        title="Ketersediaan"
        hint="Kosong = tampil di semua outlet/booth. Template tidak perlu dipilih."
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor={`pkg-outlets-${id}`} className={labelClass}>
              Outlet berlaku (kosong = semua)
            </label>
            <MultiSelect
              id={`pkg-outlets-${id}`}
              name="outlet_ids"
              options={outlets}
              value={outletIds}
              onChange={setOutletIds}
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
              value={photoboxIds}
              onChange={setPhotoboxIds}
              disabled={pending}
              ariaInvalid={fieldErrors(state, "photobox_ids").length > 0}
            />
            <FieldError state={state} field="photobox_ids" id={`pkg-boxes-err-${id}`} />
          </div>
        </div>
      </Block>

      <Block step="03" title="Ringkasan" hint="Pratinjau apa yang dilihat customer di kiosk.">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 font-mono text-xs sm:grid-cols-3">
          {[
            { label: "Nama", value: name.trim() || "—" },
            {
              label: "Harga",
              value: Number.isFinite(priceNumber) && priceNumber > 0 ? formatIDR(priceNumber) : "—",
            },
            { label: "Cetak", value: `${Number(printCount) || 0} lembar` },
            { label: "Digital", value: digitalOutput ? "Ya" : "Tidak" },
            { label: "Ketersediaan", value: availability },
            { label: "Template", value: `Semua (${templateCount} aktif)` },
          ].map((item) => (
            <div key={item.label} className="flex flex-col gap-1 border-t-2 border-ink/10 pt-2">
              <dt className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                {item.label}
              </dt>
              <dd className="text-sm font-bold uppercase tracking-[0.02em]">{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="border-2 border-ink/15 bg-muted px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.05em] text-muted-foreground">
          {`Template tidak perlu diatur di sini: semua ${templateCount} template aktif otomatis tersedia, dan jumlah foto mengikuti slot frame.`}
        </p>
      </Block>
    </div>
  );
}
