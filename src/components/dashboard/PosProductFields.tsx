import { useState } from "react";

import { Input } from "@/components/ui/input";
import { LABEL_CLASS as labelClass, fieldError } from "@/lib/form-ui";
import type { PosProductRow } from "@/server/pos-products";
import type { FormState } from "@/server/auth-actions";

/**
 * CategoryInput — datalist autocomplete kategori POS.
 * Dipakai bersama oleh PosProductFields (create) dan PosProductEditForm.
 * Controlled: menghindari peringatan Base UI FieldControl saat default berubah.
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
  const [value, setValue] = useState(defaultValue ?? "lainnya");
  return (
    <>
      <Input
        id={id}
        name="category"
        list={listId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
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
 * Field-set produk POS untuk form create/edit.
 * Controlled input: nilai di-inisialisasi dari `product` lalu dikelola lokal,
 * sehingga field Base UI tidak pernah menerima perubahan `defaultValue` setelah mount.
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
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [price, setPrice] = useState(product?.price != null ? String(product.price) : "");
  const [cost, setCost] = useState(product?.cost != null ? String(product.cost) : "");
  const [stock, setStock] = useState(product?.stock != null ? String(product.stock) : "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [imageUrl, setImageUrl] = useState(product?.image_url ?? "");
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
          value={name}
          onChange={(event) => setName(event.target.value)}
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
          value={sku}
          onChange={(event) => setSku(event.target.value)}
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
          value={price}
          onChange={(event) => setPrice(event.target.value)}
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
          value={cost}
          onChange={(event) => setCost(event.target.value)}
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
          value={stock}
          onChange={(event) => setStock(event.target.value)}
          placeholder={product ? undefined : "-"}
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
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Opsional: tampil di kartu produk terminal"
          disabled={pending}
        />
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        <label htmlFor={`pos-product-image-${id}`} className={labelClass}>
          URL Gambar
        </label>
        <Input
          id={`pos-product-image-${id}`}
          name="image_url"
          type="url"
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
          placeholder="https://... (opsional, PNG/JPG/WebP)"
          disabled={pending}
          aria-invalid={Boolean(fieldError(state, "image_url"))}
        />
        {fieldError(state, "image_url") && (
          <p role="alert" className="font-mono text-xs text-destructive">
            {fieldError(state, "image_url")}
          </p>
        )}
      </div>
    </div>
  );
}
