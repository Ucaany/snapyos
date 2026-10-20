import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * BrutalistSelect - dropdown brutalist konsisten untuk halaman admin.
 * Menggantikan pola `<select>` inline yang sebelumnya diduplikasi
 * di halaman users/subscriptions/payments.
 */
export type BrutalistSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type Props = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> & {
  label?: string;
  options: readonly BrutalistSelectOption[];
  wrapperClassName?: string;
};

export function BrutalistSelect({
  label,
  options,
  id,
  name,
  className,
  wrapperClassName,
  ...rest
}: Props) {
  const generatedId = React.useId();
  const selectId = id ?? `bs-${name ?? generatedId}`;
  return (
    <div className={cn("flex flex-col gap-1", wrapperClassName)}>
      {label ? (
        <label htmlFor={selectId} className="font-mono text-[10px] uppercase tracking-[0.12em]">
          {label}
        </label>
      ) : null}
      <select
        id={selectId}
        name={name}
        className={cn(
          "h-11 w-full min-w-[10rem] rounded-none border-2 border-ink bg-surface px-3 font-mono text-sm shadow-[2px_2px_0_0_#111111] outline-none focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:w-auto",
          className
        )}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
