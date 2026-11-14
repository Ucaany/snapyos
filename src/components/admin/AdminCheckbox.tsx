import * as React from "react";

import { Checkbox } from "@/components/admin/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * Checkbox admin berbasis shadcn Checkbox. `uncheckedValue` Base UI menjamin
 * browser tetap mengirim nilai "false" saat kotak tidak dicentang, sama
 * seperti perilaku form lama.
 *
 * Sengaja tanpa bingkai sendiri: ia duduk di dalam Card/form, bukan kartu
 * kedua di dalam kartu.
 */
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
  name: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  onValue?: string;
  offValue?: string;
  defaultChecked?: boolean;
  wrapperClassName?: string;
};

export function AdminCheckbox({
  name,
  label,
  description,
  onValue = "true",
  offValue = "false",
  defaultChecked,
  className,
  wrapperClassName,
  id,
  ...rest
}: Props) {
  const generatedId = React.useId();
  const cbId = id ?? `cb-${name}-${generatedId}`;

  return (
    <label
      htmlFor={cbId}
      className={cn("flex cursor-pointer items-start gap-2.5 py-1 text-sm", wrapperClassName)}
    >
      <Checkbox
        id={cbId}
        name={name}
        value={onValue}
        uncheckedValue={offValue}
        defaultChecked={defaultChecked}
        className={cn("mt-0.5", className)}
        {...(rest as React.ComponentProps<typeof Checkbox>)}
      />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium leading-snug">{label}</span>
        {description ? (
          <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
