"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { PackageFields, type PackageRef } from "@/components/dashboard/PackageFields";
import type { PackageRow } from "@/server/packages";
import type { FormState } from "@/server/auth-actions";
import { updatePackageAction } from "@/server/catalog-actions";

const initial: FormState = {};

type Props = {
  pkg: PackageRow;
  templates: PackageRef[];
  outlets: PackageRef[];
  photoboxes: PackageRef[];
  onDone: () => void;
};

/** PackageEditForm — per-row useActionState scope. */
export function PackageEditForm({ pkg, templates, outlets, photoboxes, onDone }: Props) {
  const [state, action, pending] = useActionState(updatePackageAction, initial);
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
      <input type="hidden" name="id" value={pkg.id} />
      <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
        {`/// Ubah: ${pkg.name.toUpperCase()}`}
      </p>
      <PackageFields
        templates={templates}
        outlets={outlets}
        photoboxes={photoboxes}
        pkg={pkg}
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
