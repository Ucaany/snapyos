import * as React from "react";

import { Label } from "@/components/admin/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/admin/ui/native-select";
import { cn } from "@/lib/utils";

/**
 * Select admin berbasis shadcn NativeSelect. API sama dengan BrutalistSelect
 * supaya form server-action tetap mengirim `name`.
 */
export type AdminSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type Props = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label?: string;
  options: readonly AdminSelectOption[];
  wrapperClassName?: string;
};

export function AdminSelect({
  label,
  options,
  id,
  name,
  className,
  wrapperClassName,
  size: _size,
  ...rest
}: Props) {
  const generatedId = React.useId();
  const selectId = id ?? `bs-${name ?? "select"}-${generatedId}`;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", wrapperClassName)}>
      {label ? (
        <Label htmlFor={selectId} className="text-xs text-muted-foreground">
          {label}
        </Label>
      ) : null}
      <NativeSelect id={selectId} name={name} className={cn("w-full", className)} {...rest}>
        {options.map((opt) => (
          <NativeSelectOption key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
