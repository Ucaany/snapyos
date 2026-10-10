import { Select } from "@/components/ui/select";

export type MultiSelectOption = { id: string; name: string };

type Props = {
  id?: string;
  name: string;
  options: MultiSelectOption[];
  defaults: string[];
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
};

/**
 * MultiSelect brutalist primitive.
 * Wraps native `<select multiple>` dengan tinggi terkontrol supaya semua opsi terlihat sekaligus.
 * Cocok untuk assignment package/outlet/photobox.
 */
export function MultiSelect({
  id,
  name,
  options,
  defaults,
  disabled,
  className,
  ariaLabel,
  ariaInvalid,
}: Props) {
  return (
    <Select
      id={id}
      name={name}
      multiple
      defaultValue={defaults}
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
