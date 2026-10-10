"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { PosProductFields } from "@/components/dashboard/PosProductFields";
import type { PosProductRow } from "@/server/pos-products";
import type { FormState } from "@/server/auth-actions";
import { posUpdateProductAction } from "@/server/pos-actions";

const initial: FormState = {};

type Props = {
  product: PosProductRow;
  categories: string[];
  onDone: () => void;
};

/** PosProductEditForm — per-row useActionState scope. */
export function PosProductEditForm({ product, categories, onDone }: Props) {
  const [state, action, pending] = useActionState(posUpdateProductAction, initial);
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
      <input type="hidden" name="id" value={product.id} />
      <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
        {`/// Ubah — ${product.name.toUpperCase()}`}
      </p>
      <PosProductFields
        product={product}
        categories={categories}
        state={state}
        pending={pending}
      />
      {state.error && (
        <p
          role="alert"
          className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
        >
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3 border-t-2 border-ink/10 pt-4">
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
