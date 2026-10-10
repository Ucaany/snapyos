import { Input } from "@/components/ui/input";
import { LABEL_CLASS as labelClass, fieldError } from "@/lib/form-ui";
import type { PosProductRow } from "@/server/pos-products";
import type { FormState } from "@/server/auth-actions";

/**
 * CategoryInput — datalist autocomplete kategori POS.
 * Dipakai bersama oleh PosProductFields (create) dan PosProductEditForm.
 */
export function CategoryInput({
  id,
  categories,
  defaultValue,
  disabled,
}: {
  id: string;
  categories: string[];
  defaultValue?: string;
  disabled?: boolean;
}) {
  const listId = `${id}-datalist`;
  return (
    <>
      <Input
        id={id}
        name="category"
        list={listId}
        defaultValue={defaultValue ?? "lainnya"}
        disabled={disabled}
        placeholder="cth. keychain"
      />
      <datalist id={listId}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}

/**
 * Field-set produk POS untuk form create/edit. Stateless.
 * Field `description` tersedia di kedua mode untuk paritas.
 */
export function PosProductFields({
  product,
  categories,
  state,
  pending,
}: {
  product?: PosProductRow;
  categories: string[];
  state: FormState;
  pending: boolean;
}) {
  const id = product?.id ?? "new";
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label htmlFor={`pos-product-name-${id}`} className={labelClass}>
          Nama produk *
        </label>
        <Input
          id={`pos-product-name-${id}`}
          name="name"
          required
          defaultValue={product?.name}
          placeholder="cth. Keychain Foto"
          disabled={pending}
          aria-invalid={Boolean(fieldError(state, "name"))}
        />
        {fieldError(state, "name") && (
          <p role="alert" className="font-mono text-xs text-destructive">
            {fieldError(state, "name")}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pos-product-sku-${id}`} className={labelClass}>
          SKU
        </label>
        <Input
          id={`pos-product-sku-${id}`}
          name="sku"
          defaultValue={product?.sku ?? ""}
          placeholder="cth. KC-001 (opsional)"
          disabled={pending}
        />
        {fieldError(state, "sku") && (
          <p role="alert" className="font-mono text-xs text-destructive">
            {fieldError(state, "sku")}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pos-product-category-${id}`} className={labelClass}>
          Kategori *
        </label>
        <CategoryInput
          id={`pos-product-category-${id}`}
          categories={categories}
          defaultValue={product?.category}
          disabled={pending}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pos-product-price-${id}`} className={labelClass}>
          Harga (IDR) *
        </label>
        <Input
          id={`pos-product-price-${id}`}
          name="price"
          type="number"
          min={1000}
          step={1000}
          required
          inputMode="numeric"
          defaultValue={product?.price}
          placeholder="15000"
          disabled={pending}
          aria-invalid={Boolean(fieldError(state, "price"))}
        />
        {fieldError(state, "price") && (
          <p role="alert" className="font-mono text-xs text-destructive">
            {fieldError(state, "price")}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pos-product-cost-${id}`} className={labelClass}>
          HPP / Cost (opsional)
        </label>
        <Input
          id={`pos-product-cost-${id}`}
          name="cost"
          type="number"
          min={0}
          step={1000}
          inputMode="numeric"
          defaultValue={product?.cost ?? ""}
          placeholder="5000"
          disabled={pending}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pos-product-stock-${id}`} className={labelClass}>
          Stok (kosong = untracked)
        </label>
        <Input
          id={`pos-product-stock-${id}`}
          name="stock"
          type="number"
          min={0}
          inputMode="numeric"
          defaultValue={product?.stock ?? ""}
          placeholder={product ? undefined : "\u2014"}
          disabled={pending}
        />
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        <label htmlFor={`pos-product-description-${id}`} className={labelClass}>
          Deskripsi
        </label>
        <Input
          id={`pos-product-description-${id}`}
          name="description"
          defaultValue={product?.description ?? ""}
          placeholder="Opsional — tampil di kartu produk terminal"
          disabled={pending}
        />
      </div>
    </div>
  );
}
