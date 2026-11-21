"use client";

import * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export type MultiSelectOption = { id: string; name: string };

type Props = {
  id?: string;
  name: string;
  options: MultiSelectOption[];
  /** Nilai awal (uncontrolled) — dipakai bila `value` tidak diberikan. */
  defaults?: string[];
  /** Nilai terkontrol. Bila diberikan, komponen bersifat controlled. */
  value?: string[];
  onChange?: (next: string[]) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
};

/**
 * MultiSelect — daftar Checkbox registry. `name` berulang membuat form
 * server-action tetap membaca `formData.getAll(name)`.
 */
export function MultiSelect({
  id,
  name,
  options,
  defaults,
  value,
  onChange,
  disabled,
  className,
  ariaLabel,
  ariaInvalid,
}: Props) {
  const controlled = value !== undefined;
  const selected = new Set(controlled ? value : (defaults ?? []));

  const toggle = (optionId: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(optionId);
    else next.delete(optionId);
    onChange?.(Array.from(next));
  };

  return (
    <fieldset
      id={id}
      disabled={disabled}
      aria-label={ariaLabel ?? name}
      aria-invalid={ariaInvalid}
      className={cn(
        "max-h-56 overflow-y-auto rounded-base border-2 border-border bg-secondary-background p-2 shadow-shadow",
        className
      )}
    >
      <div className="flex flex-col">
        {options.map((option) => (
          <label
            key={option.id}
            className="flex min-h-11 cursor-pointer items-center gap-3 px-2 text-sm font-base hover:bg-muted"
          >
            <Checkbox
              name={name}
              value={option.id}
              {...(controlled
                ? {
                    checked: selected.has(option.id),
                    onCheckedChange: (checked) => toggle(option.id, checked === true),
                  }
                : { defaultChecked: selected.has(option.id) })}
            />
            <span className="min-w-0 truncate">{option.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
