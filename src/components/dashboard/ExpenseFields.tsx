import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LABEL_CLASS as labelClass, fieldError } from "@/lib/form-ui";
import { EXPENSE_CATEGORIES } from "@/lib/validators";
import type { ExpenseRow } from "@/server/finance";
import type { FormState } from "@/server/auth-actions";

export type ExpenseRef = { id: string; name: string };

/** Field-set expense untuk form create/edit. Stateless. */
export function ExpenseFields({
  expense,
  outlets,
  state,
  pending,
}: {
  expense?: ExpenseRow;
  outlets: ExpenseRef[];
  state: FormState;
  pending: boolean;
}) {
  const id = expense?.id ?? "new";
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      <div className="flex flex-col gap-2">
        <label htmlFor={`exp-cat-${id}`} className={labelClass}>
          Kategori *
        </label>
        <Select id={`exp-cat-${id}`} name="category" defaultValue={expense?.category ?? "other"} disabled={pending}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.toUpperCase()}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`exp-amount-${id}`} className={labelClass}>
          Nominal (IDR) *
        </label>
        <Input
          id={`exp-amount-${id}`}
          name="amount"
          type="number"
          min={1}
          step={1}
          required
          defaultValue={expense?.amount}
          placeholder="150000"
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
        <label htmlFor={`exp-date-${id}`} className={labelClass}>
          Tanggal *
        </label>
        <Input
          id={`exp-date-${id}`}
          name="expense_date"
          type="date"
          required
          defaultValue={expense?.expense_date ?? new Date().toISOString().slice(0, 10)}
          disabled={pending}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`exp-outlet-${id}`} className={labelClass}>
          Outlet (opsional)
        </label>
        <Select id={`exp-outlet-${id}`} name="outlet_id" defaultValue={expense?.outlet_id ?? ""} disabled={pending}>
          <option value="">Semua outlet</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        <label htmlFor={`exp-note-${id}`} className={labelClass}>
          Catatan
        </label>
        <Input id={`exp-note-${id}`} name="note" defaultValue={expense?.note ?? ""} placeholder="cth. Kertas 4R 5 pack" disabled={pending} />
      </div>
    </div>
  );
}
