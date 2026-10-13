import { Select } from "@/components/ui/select";

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
 * MultiSelect brutalist primitive.
 * Wraps native `<select multiple>` dengan tinggi terkontrol supaya semua opsi terlihat sekaligus.
 * Cocok untuk assignment package/outlet/photobox.
 * Mendukung mode uncontrolled (`defaults`) dan controlled (`value` + `onChange`).
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
  return (
    <Select
      id={id}
      name={name}
      multiple
      {...(controlled
        ? {
            value,
            onChange: (e) =>
              onChange?.(Array.from(e.target.selectedOptions, (o) => o.value)),
          }
        : { defaultValue: defaults })}
      disabled={disabled}
      aria-label={ariaLabel ?? name}
      aria-invalid={ariaInvalid}
      className={className ?? "h-auto min-h-[88px] py-2"}
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </Select>
  );
}
