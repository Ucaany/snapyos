"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { ExpenseFields, type ExpenseRef } from "@/components/dashboard/ExpenseFields";
import type { ExpenseRow } from "@/server/finance";
import type { FormState } from "@/server/auth-actions";
import { updateExpenseAction } from "@/server/finance-actions";

const initial: FormState = {};

type Props = {
  expense: ExpenseRow;
  outlets: ExpenseRef[];
  onDone: () => void;
};

/** ExpenseEditForm — per-row useActionState scope. */
export function ExpenseEditForm({ expense, outlets, onDone }: Props) {
  const [state, action, pending] = useActionState(updateExpenseAction, initial);
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (wasPending.current && !state.error && !state.fieldErrors) {
      wasPending.current = false;
      onDone();
    }
  }, [pending, state, onDone]);

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="id" value={expense.id} />
      <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
        {`/// Ubah: ${expense.category.toUpperCase()} ${expense.expense_date}`}
      </p>
      <ExpenseFields expense={expense} outlets={outlets} state={state} pending={pending} />
      {state.error && (
        <p
          role="alert"
          className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
        >
          {state.error}
        </p>
      )}
      <div className="flex justify-end gap-3 border-t-2 border-ink/10 pt-4">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={pending}>
          Batal
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Menyimpan\u2026" : "Simpan perubahan"}
        </Button>
      </div>
    </form>
  );
}
