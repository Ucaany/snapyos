"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatIDR } from "@/lib/dashboard-math";
import type { PosProductRow } from "@/server/pos-products";
import {
  posCancelOrderAction,
  posPayOrderAction,
  posSubmitOrderAction,
} from "@/server/pos-actions";
import { PayMethodDialog } from "@/components/pos/PayMethodDialog";

export type TerminalProduct = Pick<
  PosProductRow,
  "id" | "name" | "sku" | "category" | "price" | "stock" | "image_url" | "description"
>;

type CartLine = { productId: string; qty: number };

/**
 * PosTerminal — terminal kasir full-screen per booth (docs/pos/03 §5.3).
 * Cart = client state murni (display only); harga/total dihitung server saat
 * submit (A8). Flow: submit cart → order pending → pilih metode → paid → struk.
 */
export function PosTerminal({
  booth,
  products,
  cashierName,
  businessName,
}: {
  booth: { id: string; name: string; outletName: string | null };
  products: TerminalProduct[];
  cashierName: string | null;
  businessName: string;
}) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [pendingOrder, setPendingOrder] = useState<{
    orderId: string;
    number: string;
    finalAmount: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))],
    [products]
  );

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search, category]);

  const cartQty = (productId: string) =>
    cart.find((l) => l.productId === productId)?.qty ?? 0;

  const addProduct = (product: TerminalProduct) => {
    if (product.stock !== null && cartQty(product.id) >= product.stock) return;
    setError(null);
    setCart((prev) => {
      const line = prev.find((l) => l.productId === product.id);
      if (line) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, qty: l.qty + 1 } : l
        );
      }
      return [...prev, { productId: product.id, qty: 1 }];
    });
  };

  const setQty = (productId: string, qty: number) => {
    setError(null);
    if (qty <= 0) {
      setCart((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, qty } : l))
    );
  };

  const cartLines = cart.flatMap((line) => {
    const product = products.find((p) => p.id === line.productId);
    return product ? [{ ...line, product }] : [];
  });

  const gross = cartLines.reduce((s, l) => s + l.product.price * l.qty, 0);
  const totalQty = cartLines.reduce((s, l) => s + l.qty, 0);

  const submitCart = async () => {
    if (cart.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await posSubmitOrderAction({
        photoboxId: booth.id,
        items: cart.map((l) => ({ productId: l.productId, qty: l.qty })),
      });
      setPendingOrder({
        orderId: detail.order.id,
        number: detail.order.number,
        finalAmount: detail.order.final_amount,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat order");
    } finally {
      setBusy(false);
    }
  };

  const pay = async (method: "cash" | "bank_transfer" | "other") => {
    if (!pendingOrder || busy) return;
    setBusy(true);
    setError(null);
    try {
      await posPayOrderAction({ orderId: pendingOrder.orderId, method });
      router.push(`/pos/receipt/${pendingOrder.orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencatat pembayaran");
      setBusy(false);
    }
  };

  const cancelPending = async () => {
    if (!pendingOrder || busy) return;
    setBusy(true);
    setError(null);
    try {
      await posCancelOrderAction({ orderId: pendingOrder.orderId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membatalkan pesanan");
    } finally {
      setPendingOrder(null);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink bg-surface px-4 py-3 md:px-6">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] md:text-xs">
          {"/// TERMINAL KASIR"}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground md:text-xs">
          {businessName.toUpperCase()} · BOOTH: {booth.name.toUpperCase()} · OUTLET:{" "}
          {(booth.outletName ?? "—").toUpperCase()} · STAFF:{" "}
          {(cashierName ?? "—").toUpperCase()}
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="border-b-2 border-ink bg-destructive/10 px-4 py-3 font-mono text-xs font-bold uppercase tracking-[0.05em] text-ink md:px-6"
        >
          {"[ ERROR ] "}
          {error}
        </p>
      )}

      <div className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-[1fr_400px]">
        {/* Katalog produk */}
        <section
          aria-label="Katalog produk"
          className="flex flex-col gap-4 border-ink p-4 md:p-6 lg:border-r-2"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama / SKU produk"
                className="pl-9"
                aria-label="Cari produk"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter kategori"
              className="h-11 w-full border-2 border-ink bg-surface px-3 font-mono text-sm shadow-[2px_2px_0_0_#111111] outline-none focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:w-56"
            >
              <option value="">SEMUA KATEGORI</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {visibleProducts.length === 0 ? (
            <div className="flex flex-1 items-center justify-center border-2 border-dashed border-ink/40 bg-muted p-8">
              <p className="font-mono text-sm font-bold uppercase tracking-[0.15em]">
                {"/// Tidak ada produk cocok"}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-[2px] border-2 border-ink bg-ink sm:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((product) => {
                const qty = cartQty(product.id);
                const soldOut = product.stock === 0;
                return (
                  <li key={product.id} className="relative bg-surface">
                    <button
                      type="button"
                      onClick={() => addProduct(product)}
                      disabled={soldOut}
                      className={cn(
                        "flex h-full w-full flex-col justify-between gap-3 border-2 border-transparent p-4 text-left transition-colors",
                        soldOut
                          ? "cursor-not-allowed opacity-60"
                          : "hover:border-ink hover:bg-accent active:translate-x-[2px] active:translate-y-[2px]"
                      )}
                    >
                      <span className="font-mono text-sm font-bold uppercase leading-snug tracking-[0.03em]">
                        {product.name}
                      </span>
                      <span className="flex items-end justify-between gap-2">
                        <span className="font-mono text-sm font-bold">
                          {formatIDR(product.price)}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                          {product.stock === null ? "—" : `SISA ${product.stock}`}
                        </span>
                      </span>
                      {qty > 0 && (
                        <span className="absolute -left-[2px] -top-[2px] flex size-7 items-center justify-center border-2 border-ink bg-ink font-mono text-xs font-bold text-bg">
                          {qty}
                        </span>
                      )}
                    </button>
                    {soldOut && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,rgba(17,17,17,0.08)_8px,rgba(17,17,17,0.08)_16px)]"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Panel keranjang */}
        <aside
          aria-label="Keranjang"
          className="flex flex-col gap-4 border-t-2 border-ink bg-surface p-4 md:p-6 lg:border-t-0"
        >
          <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
            {"/// Keranjang"}
            <span className="ml-2 text-muted-foreground">{totalQty} item</span>
          </p>

          {cartLines.length === 0 ? (
            <div className="flex flex-1 items-center justify-center border-2 border-dashed border-ink/40 p-6">
              <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                 Keranjang kosong. Pilih produk.
              </p>
            </div>
          ) : (
            <ul className="flex max-h-[42dvh] flex-col gap-[2px] overflow-y-auto border-2 border-ink bg-ink lg:max-h-none lg:flex-1">
              {cartLines.map(({ product, qty }) => (
                <li
                  key={product.id}
                  className="flex items-center gap-3 bg-surface p-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs font-bold uppercase tracking-[0.03em]">
                      {product.name}
                    </span>
                    <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {formatIDR(product.price)} × {qty} = {formatIDR(product.price * qty)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={`Kurangi ${product.name}`}
                      onClick={() => setQty(product.id, qty - 1)}
                    >
                      <Minus aria-hidden />
                    </Button>
                    <output className="w-8 text-center font-mono text-sm font-bold">
                      {qty}
                    </output>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      aria-label={`Tambah ${product.name}`}
                      onClick={() => addProduct(product)}
                      disabled={product.stock !== null && qty >= product.stock}
                    >
                      <Plus aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Hapus ${product.name} dari keranjang`}
                      onClick={() => setQty(product.id, 0)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <dl className="flex flex-col gap-1 border-t-2 border-ink pt-4 font-mono text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Subtotal
              </dt>
              <dd className="font-bold">{formatIDR(gross)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Diskon
              </dt>
              <dd>{formatIDR(0)}</dd>
            </div>
            <div className="flex items-center justify-between border-t-2 border-ink pt-2">
              <dt className="text-[10px] font-bold uppercase tracking-[0.15em]">Total</dt>
              <dd className="text-lg font-bold">{formatIDR(gross)}</dd>
            </div>
          </dl>

          <Button
            size="lg"
            onClick={() => void submitCart()}
            disabled={cart.length === 0 || busy}
          >
            {busy ? "Memproses…" : "Bayar"}
          </Button>
        </aside>
      </div>

      {pendingOrder && (
        <PayMethodDialog
          orderNumber={pendingOrder.number}
          finalAmount={pendingOrder.finalAmount}
          busy={busy}
          onPay={pay}
          onCancel={cancelPending}
        />
      )}
    </div>
  );
}
