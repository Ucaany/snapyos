"use client";

import { useState } from "react";

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

/** Pesan error field dari server — satu jalur render agar tidak ada field yang tertelan. */
function FieldError({ state, field }: { state: FormState; field: string }) {
  const message = fieldError(state, field);
  if (!message) return null;
  return (
    <p role="alert" className="font-mono text-xs text-destructive">
      {message}
    </p>
  );
}

type Values = {
  code: string;
  type: string;
  amount: string;
  min_transaction: string;
  max_discount: string;
  usage_limit: string;
  usage_per_customer: string;
  start_date: string;
  end_date: string;
  package_ids: string[];
  outlet_ids: string[];
  is_active: boolean;
};

function initialValues(voucher?: VoucherRow): Values {
  return {
    code: voucher?.code ?? "",
    type: voucher?.type ?? "percentage",
    amount: voucher?.amount != null ? String(voucher.amount) : "",
    min_transaction: String(voucher?.min_transaction ?? 0),
    max_discount: voucher?.max_discount != null ? String(voucher.max_discount) : "",
    usage_limit: voucher?.usage_limit != null ? String(voucher.usage_limit) : "",
    usage_per_customer: String(voucher?.usage_per_customer ?? 1),
    start_date: toLocalInput(voucher?.start_date ?? null),
    end_date: toLocalInput(voucher?.end_date ?? null),
    package_ids: voucher?.package_ids ?? [],
    outlet_ids: voucher?.outlet_ids ?? [],
    is_active: voucher?.is_active ?? true,
  };
}

/**
 * Field-set voucher untuk form create/edit.
 * Controlled (state lokal) supaya nilai yang diketik tidak hilang saat form
 * re-render setelah error validasi server (menghindari desync uncontrolled
 * FieldControl + warning Base UI dev).
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
  const [values, setValues] = useState<Values>(() => initialValues(voucher));
  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

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
          value={values.code}
          onChange={(e) => set("code", e.target.value.toUpperCase())}
          placeholder="GRANDOPENING"
          className="uppercase"
          disabled={pending}
          aria-invalid={Boolean(fieldError(state, "code"))}
        />
        <FieldError state={state} field="code" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-type-${id}`} className={labelClass}>
          Tipe diskon *
        </label>
        <Select
          id={`vcr-type-${id}`}
          name="type"
          value={values.type}
          onChange={(e) => set("type", e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(fieldError(state, "type"))}
        >
          <option value="percentage">PERCENTAGE (%)</option>
          <option value="fixed">FIXED (IDR)</option>
        </Select>
        <FieldError state={state} field="type" />
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
          value={values.amount}
          onChange={(e) => set("amount", e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(fieldError(state, "amount"))}
        />
        <FieldError state={state} field="amount" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-min-${id}`} className={labelClass}>
          Minimum transaksi (IDR)
        </label>
        <Input
          id={`vcr-min-${id}`}
          name="min_transaction"
          type="number"
          min={0}
          step={1}
          value={values.min_transaction}
          onChange={(e) => set("min_transaction", e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(fieldError(state, "min_transaction"))}
        />
        <FieldError state={state} field="min_transaction" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-max-${id}`} className={labelClass}>
          Maksimum diskon (IDR, opsional)
        </label>
        <Input
          id={`vcr-max-${id}`}
          name="max_discount"
          type="number"
          min={0}
          step={1}
          value={values.max_discount}
          onChange={(e) => set("max_discount", e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(fieldError(state, "max_discount"))}
        />
        <FieldError state={state} field="max_discount" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-limit-${id}`} className={labelClass}>
          {"Batas pemakaian total (kosong = tanpa batas)"}
        </label>
        <Input
          id={`vcr-limit-${id}`}
          name="usage_limit"
          type="number"
          min={0}
          step={1}
          value={values.usage_limit}
          onChange={(e) => set("usage_limit", e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(fieldError(state, "usage_limit"))}
        />
        <FieldError state={state} field="usage_limit" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-per-${id}`} className={labelClass}>
          Pemakaian per pelanggan
        </label>
        <Input
          id={`vcr-per-${id}`}
          name="usage_per_customer"
          type="number"
          min={1}
          step={1}
          value={values.usage_per_customer}
          onChange={(e) => set("usage_per_customer", e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(fieldError(state, "usage_per_customer"))}
        />
        <FieldError state={state} field="usage_per_customer" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label htmlFor={`vcr-start-${id}`} className={labelClass}>
            Mulai
          </label>
          <Input
            id={`vcr-start-${id}`}
            name="start_date"
            type="datetime-local"
            value={values.start_date}
            onChange={(e) => set("start_date", e.target.value)}
            disabled={pending}
            aria-invalid={Boolean(fieldError(state, "start_date"))}
          />
          <FieldError state={state} field="start_date" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`vcr-end-${id}`} className={labelClass}>
            Berakhir
          </label>
          <Input
            id={`vcr-end-${id}`}
            name="end_date"
            type="datetime-local"
            value={values.end_date}
            onChange={(e) => set("end_date", e.target.value)}
            disabled={pending}
            aria-invalid={Boolean(fieldError(state, "end_date"))}
          />
          <FieldError state={state} field="end_date" />
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
          value={values.package_ids}
          onChange={(next) => set("package_ids", next)}
          disabled={pending}
          className="h-auto min-h-[72px] py-2"
          ariaInvalid={Boolean(fieldError(state, "package_ids"))}
        />
        <FieldError state={state} field="package_ids" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`vcr-outlets-${id}`} className={labelClass}>
          Outlet berlaku (pilih beberapa, kosong berarti semua)
        </label>
        <MultiSelect
          id={`vcr-outlets-${id}`}
          name="outlet_ids"
          options={outlets}
          value={values.outlet_ids}
          onChange={(next) => set("outlet_ids", next)}
          disabled={pending}
          className="h-auto min-h-[72px] py-2"
          ariaInvalid={Boolean(fieldError(state, "outlet_ids"))}
        />
        <FieldError state={state} field="outlet_ids" />
      </div>
      <label className="flex items-center gap-2 self-end border-2 border-ink/10 px-3 py-3 font-mono text-xs uppercase tracking-[0.05em]">
        <input
          type="checkbox"
          name="is_active"
          checked={values.is_active}
          onChange={(e) => set("is_active", e.target.checked)}
          disabled={pending}
          className="size-4 accent-ink"
        />
        Aktif
      </label>
    </div>
  );
}
