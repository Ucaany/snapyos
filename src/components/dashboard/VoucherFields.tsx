import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select } from "@/components/ui/select";
import { LABEL_CLASS as labelClass, fieldError } from "@/lib/form-ui";
import type { VoucherRow } from "@/server/vouchers";
import type { FormState } from "@/server/auth-actions";

export type VoucherRef = { id: string; name: string };

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

/**
 * Field-set voucher untuk form create/edit. Stateless — semua state di caller.
 */
export function VoucherFields({
  voucher,
  packages,
  outlets,
  state,
  pending,
}: {
  voucher?: VoucherRow;
  packages: VoucherRef[];
  outlets: VoucherRef[];
  state: FormState;
  pending: boolean;
}) {
  const id = voucher?.id ?? "new";
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-code-${id}`} className={labelClass}>
          Kode * (huruf besar)
        </label>
        <Input
          id={`vcr-code-${id}`}
          name="code"
          required
          defaultValue={voucher?.code}
          placeholder="GRANDOPENING"
          className="uppercase"
          disabled={pending}
          aria-invalid={Boolean(fieldError(state, "code"))}
        />
        {fieldError(state, "code") && (
          <p role="alert" className="font-mono text-xs text-destructive">
            {fieldError(state, "code")}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-type-${id}`} className={labelClass}>
          Tipe diskon *
        </label>
        <Select id={`vcr-type-${id}`} name="type" defaultValue={voucher?.type ?? "percentage"} disabled={pending}>
          <option value="percentage">PERCENTAGE (%)</option>
          <option value="fixed">FIXED (IDR)</option>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-amount-${id}`} className={labelClass}>
          Nilai diskon * (% atau IDR)
        </label>
        <Input
          id={`vcr-amount-${id}`}
          name="amount"
          type="number"
          min={1}
          step={1}
          required
          defaultValue={voucher?.amount}
          disabled={pending}
          aria-invalid={Boolean(fieldError(state, "amount"))}
        />
        {fieldError(state, "amount") && (
          <p role="alert" className="font-mono text-xs text-destructive">
            {fieldError(state, "amount")}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-min-${id}`} className={labelClass}>
          Minimum transaksi (IDR)
        </label>
        <Input id={`vcr-min-${id}`} name="min_transaction" type="number" min={0} step={1} defaultValue={voucher?.min_transaction ?? 0} disabled={pending} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-max-${id}`} className={labelClass}>
          Maksimum diskon (IDR, opsional)
        </label>
        <Input id={`vcr-max-${id}`} name="max_discount" type="number" min={0} step={1} defaultValue={voucher?.max_discount ?? ""} disabled={pending} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-limit-${id}`} className={labelClass}>
          {"Usage limit total (kosong = \u221E)"}
        </label>
        <Input id={`vcr-limit-${id}`} name="usage_limit" type="number" min={0} step={1} defaultValue={voucher?.usage_limit ?? ""} disabled={pending} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-per-${id}`} className={labelClass}>
          Usage per customer
        </label>
        <Input id={`vcr-per-${id}`} name="usage_per_customer" type="number" min={1} step={1} defaultValue={voucher?.usage_per_customer ?? 1} disabled={pending} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor={`vcr-start-${id}`} className={labelClass}>
            Mulai
          </label>
          <Input id={`vcr-start-${id}`} name="start_date" type="datetime-local" defaultValue={toLocalInput(voucher?.start_date ?? null)} disabled={pending} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`vcr-end-${id}`} className={labelClass}>
            Berakhir
          </label>
          <Input id={`vcr-end-${id}`} name="end_date" type="datetime-local" defaultValue={toLocalInput(voucher?.end_date ?? null)} disabled={pending} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-packages-${id}`} className={labelClass}>
          Paket berlaku (pilih beberapa, kosong berarti semua)
        </label>
        <MultiSelect
          id={`vcr-packages-${id}`}
          name="package_ids"
          options={packages}
          defaults={voucher?.package_ids ?? []}
          disabled={pending}
          className="h-auto min-h-[72px] py-2"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-outlets-${id}`} className={labelClass}>
          Outlet berlaku (pilih beberapa, kosong berarti semua)
        </label>
        <MultiSelect
          id={`vcr-outlets-${id}`}
          name="outlet_ids"
          options={outlets}
          defaults={voucher?.outlet_ids ?? []}
          disabled={pending}
          className="h-auto min-h-[72px] py-2"
        />
      </div>
      <label className="flex items-center gap-2 self-end border-2 border-ink/10 px-3 py-3 font-mono text-xs uppercase tracking-[0.05em]">
        <input type="checkbox" name="is_active" defaultChecked={voucher?.is_active ?? true} disabled={pending} className="size-4 accent-[#111111]" />
        Aktif
      </label>
    </div>
  );
}
