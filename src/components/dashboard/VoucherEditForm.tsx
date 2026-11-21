"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { VoucherFields, type VoucherRef } from "@/components/dashboard/VoucherFields";
import type { VoucherRow } from "@/server/vouchers";
import type { FormState } from "@/server/auth-actions";
import { updateVoucherAction } from "@/server/catalog-actions";

const initial: FormState = {};

type Props = {
  voucher: VoucherRow;
  packages: VoucherRef[];
  outlets: VoucherRef[];
  onDone: () => void;
};

/**
 * VoucherEditForm — instance per baris agar `useActionState` ter-scope
 * dan state error/pending tidak bocor antar-baris.
 */
export function VoucherEditForm({ voucher, packages, outlets, onDone }: Props) {
  const [state, action, pending] = useActionState(updateVoucherAction, initial);
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
      <input type="hidden" name="id" value={voucher.id} />
      <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
        {`Ubah: ${voucher.code}`}
      </p>
      <VoucherFields
        voucher={voucher}
        packages={packages}
        outlets={outlets}
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
      <div className="flex justify-end gap-3 border-t-2 border-ink/10 pt-4">
        <Button type="button" variant="neutral" size="sm" onClick={onDone} disabled={pending}>
          Batal
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Menyimpan\u2026" : "Simpan perubahan"}
        </Button>
      </div>
    </form>
  );
}
