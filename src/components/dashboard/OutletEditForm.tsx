"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WilayahPicker } from "@/components/dashboard/WilayahPicker";
import { LABEL_CLASS as labelClass, fieldError } from "@/lib/form-ui";
import type { OutletRow } from "@/server/outlets";
import type { FormState } from "@/server/auth-actions";
import { updateOutletAction } from "@/server/booth-actions";

const initial: FormState = {};

type Props = {
  outlet: OutletRow;
  onDone: () => void;
};

/** OutletEditForm — per-row useActionState agar error/pending tidak bocor. */
export function OutletEditForm({ outlet, onDone }: Props) {
  const [state, action, pending] = useActionState(updateOutletAction, initial);
  const wasPending = useRef(false);

  // Controlled fields — Base UI Input/Select adalah FieldControl; memakai
  // defaultValue memicu warning "uncontrolled FieldControl" saat revalidate
  // me-render ulang baris setelah save sukses. State awal dari outlet.
  const [name, setName] = useState(outlet.name);
  const [address, setAddress] = useState(outlet.address ?? "");
  const [status, setStatus] = useState(outlet.status);

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
      <input type="hidden" name="id" value={outlet.id} />
      <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
        {`/// Ubah — ${outlet.name.toUpperCase()}`}
      </p>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor={`edit-name-${outlet.id}`} className={labelClass}>
            Nama *
          </label>
          <Input
            id={`edit-name-${outlet.id}`}
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={pending}
            aria-invalid={Boolean(fieldError(state, "name"))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`edit-address-${outlet.id}`} className={labelClass}>
            Alamat
          </label>
          <Input
            id={`edit-address-${outlet.id}`}
            name="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={pending}
          />
        </div>
        <WilayahPicker
          idPrefix={`outlet-edit-${outlet.id}`}
          province={outlet.province}
          city={outlet.city}
          disabled={pending}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor={`edit-status-${outlet.id}`} className={labelClass}>
            Status
          </label>
          <Select
            id={`edit-status-${outlet.id}`}
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={pending}
          >
            <option value="active">ACTIVE</option>
            <option value="inactive">INACTIVE</option>
          </Select>
        </div>
      </div>
      {fieldError(state, "name") && (
        <p role="alert" className="font-mono text-xs text-destructive">
          {fieldError(state, "name")}
        </p>
      )}
      {state.error && (
        <p role="alert" className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink">
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
