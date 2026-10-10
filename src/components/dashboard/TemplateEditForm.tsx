"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LABEL_CLASS as labelClass } from "@/lib/form-ui";
import { TEMPLATE_CATEGORIES } from "@/lib/validators";
import type { TemplateRow } from "@/server/templates";
import type { FormState } from "@/server/auth-actions";
import { updateTemplateAction } from "@/server/catalog-actions";

const initial: FormState = {};

type Props = {
  template: TemplateRow;
  onDone: () => void;
};

/** TemplateEditForm — per-card useActionState scope. */
export function TemplateEditForm({ template, onDone }: Props) {
  const [state, action, pending] = useActionState(updateTemplateAction, initial);
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
    <form action={action} className="flex flex-col gap-3 border-t-2 border-ink/10 pt-3" noValidate>
      <input type="hidden" name="id" value={template.id} />
      <div className="flex flex-col gap-2">
        <label htmlFor={`tpl-edit-name-${template.id}`} className={labelClass}>
          Nama *
        </label>
        <Input id={`tpl-edit-name-${template.id}`} name="name" defaultValue={template.name} disabled={pending} />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`tpl-edit-cat-${template.id}`} className={labelClass}>
          Kategori
        </label>
        <Select id={`tpl-edit-cat-${template.id}`} name="category" defaultValue={template.category} disabled={pending}>
          {TEMPLATE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.toUpperCase()}
            </option>
          ))}
        </Select>
      </div>
      <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.05em]">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={template.is_active}
          disabled={pending}
          className="size-4 accent-[#111111]"
        />
        Aktif
      </label>
      {state.error && (
        <p role="alert" className="font-mono text-xs text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={pending}>
          Batal
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Menyimpan\u2026" : "Simpan"}
        </Button>
      </div>
    </form>
  );
}
