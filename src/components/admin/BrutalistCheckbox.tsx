import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * BrutalistCheckbox - enkapsulasi pola "hidden false + checkbox true" untuk
 * form admin. Menjamin browser mengirim value "false" ketika checkbox off
 * (default HTML: unchecked → no field at all).
 *
 * Menggantikan pola berulang di halaman plans/add-ons/settings.
 */
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value"> & {
  name: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  /** Nilai yang dikirim ketika checkbox tercentang. Default "true". */
  onValue?: string;
  /** Nilai yang dikirim ketika tidak dicentang. Default "false". */
  offValue?: string;
  defaultChecked?: boolean;
  wrapperClassName?: string;
};

export function BrutalistCheckbox({
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
      className={cn(
        "flex min-h-11 items-start gap-2 border-2 border-ink/20 bg-muted/40 p-3 font-mono text-xs uppercase tracking-[0.1em]",
        wrapperClassName
      )}
    >
      {/* Hidden fallback: ensure form field always present (even when off) */}
      <input type="hidden" name={name} value={offValue} />
      <input
        id={cbId}
        type="checkbox"
        name={name}
        value={onValue}
        defaultChecked={defaultChecked}
        className={cn("mt-0.5 h-4 w-4 accent-[#ffd400]", className)}
        {...rest}
      />
      <span className="flex flex-col gap-0.5">
        <span className="font-bold">{label}</span>
        {description ? (
          <span className="text-[11px] normal-case tracking-normal text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
