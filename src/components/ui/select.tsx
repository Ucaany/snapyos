"use client";

import * as React from "react";

import {
  Select as SelectPrimitive,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/rich-select";
import { cn } from "@/lib/utils";

type Option = { value: string; label: React.ReactNode; disabled?: boolean };

function collectOptions(children: React.ReactNode): Option[] {
  const out: Option[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === "option") {
      const props = child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
      out.push({
        value: String(props.value ?? ""),
        label: props.children,
        disabled: props.disabled,
      });
      return;
    }
    if (child.type === "optgroup") {
      const props = child.props as React.OptgroupHTMLAttributes<HTMLOptGroupElement>;
      out.push(...collectOptions(props.children));
    }
  });
  return out;
}

/**
 * Select — kompatibilitas form SnapyOS di atas registry Select (Base UI).
 * Menerima API native `<select>` (`name`, `defaultValue`, `value`, `onChange`,
 * children `<option>`) supaya form server-action tidak perlu ditulis ulang,
 * tetapi tampilan dan interaksi memakai komponen neobrutalism.dev.
 *
 * `multiple` tetap memakai `<select multiple>` native sampai MultiSelect
 * dimigrasikan ke checkbox group.
 */
function Select({
  className,
  children,
  name,
  id,
  defaultValue,
  value,
  onChange,
  disabled,
  required,
  multiple,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: React.ComponentProps<"select">) {
  const options = collectOptions(children);
  const [internal, setInternal] = React.useState(String(defaultValue ?? ""));
  const current = value !== undefined ? String(value) : internal;
  const selected = options.find((option) => option.value === current);

  if (multiple) {
    return (
      <select
        id={id}
        name={name}
        multiple
        value={value as string[] | undefined}
        defaultValue={defaultValue as string[] | undefined}
        onChange={onChange}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className={cn(
          "h-auto min-h-[88px] w-full rounded-base border-2 border-border bg-secondary-background px-3 py-2 font-base text-sm text-foreground shadow-shadow outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        {children}
      </select>
    );
  }

  return (
    <SelectPrimitive
      name={name}
      value={current}
      onValueChange={(next) => {
        if (value === undefined) setInternal(String(next ?? ""));
        onChange?.({
          target: { value: String(next ?? ""), name },
          currentTarget: { value: String(next ?? ""), name },
        } as React.ChangeEvent<HTMLSelectElement>);
      }}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className={cn("h-10 w-full", className)}
      >
        <SelectValue placeholder={selected?.label ?? "Pilih"}>
          {() => selected?.label ?? "Pilih"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectPrimitive>
  );
}

export { Select };
