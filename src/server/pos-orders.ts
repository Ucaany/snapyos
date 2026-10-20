import "server-only";

import { randomUUID } from "node:crypto";

import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { insertAudit } from "@/server/audit";
import { requirePosAccess } from "@/server/pos-entitlement";
import {
  classifyPosManualPay,
  computePosTotals,
  posOrderNumber,
  posDayRange,
} from "@/lib/pos-math";
import { formatTxNumber, todayISO } from "@/lib/dashboard-math";
import { resolvePosReceiptSettings } from "@/lib/pos-receipt-settings";
import {
  posOrderCreateSchema,
  posManualPaySchema,
  type PosOrderCreateInput,
  type PosManualPayInput,
} from "@/lib/validators";

/**
 * POS order & pay offline — docs/pos/03 §4 (A2 offline-only).
 * Uang: integer IDR, server-computed (A8). Tanpa payments/creditBalance (A3).
 */

export type PosOrderItemRow = {
  id: string;
  pos_product_id: string | null;
  name_snapshot: string;
  sku_snapshot: string | null;
  unit_price_snapshot: number;
  quantity: number;
  subtotal: number;
};

export type PosOrderRow = {
  id: string;
  number: string;
  status: string;
  business_id: string;
  photobox_id: string;
  photobox_name: string | null;
  outlet_id: string | null;
  outlet_name: string | null;
  cashier_user_id: string;
  cashier_name: string | null;
  gross_amount: number;
  discount_amount: number;
  final_amount: number;
  payment_method: string;
  paid_at: string | null;
  created_at: string;
  /** Lebar kertas printer thermal booth (58/80mm); null untuk jalur browser. */
  paper_width_mm: 58 | 80 | null;
  /** Jalur cetak booth saat transaksi dibuat. */
  print_mode: "browser" | "bluetooth";
  /** Auto-print struk saat halaman struk dibuka (sekali per sesi browser). */
  auto_print: boolean;
};

export type PosOrderDetail = { order: PosOrderRow; items: PosOrderItemRow[] };

type JoinName = { name: string } | { name: string }[] | null;
type JoinBooth = {
  name: string;
  print_settings?: {
    bluetooth_paper_width_mm?: number;
    mode?: string;
    auto_print?: boolean;
  } | null;
} | null;

const ORDER_COLUMNS = `id, number, status, business_id, photobox_id, outlet_id, cashier_user_id,
  gross_amount, discount_amount, final_amount, payment_method, paid_at, created_at,
  photoboxes ( name, print_settings ), outlets ( name ), cashier:users ( name )`;

const ITEM_COLUMNS = `id, pos_product_id, name_snapshot, sku_snapshot, unit_price_snapshot, quantity, subtotal`;

function mapOrder(row: unknown): PosOrderRow {
  const r = row as {
    id: string;
    number: string;
    status: string;
    business_id: string;
    photobox_id: string;
    outlet_id: string | null;
    cashier_user_id: string;
    gross_amount: number;
    discount_amount: number;
    final_amount: number;
    payment_method: string;
    paid_at: string | null;
    created_at: string;
    photoboxes?: JoinBooth;
    outlets?: JoinName;
    cashier?: JoinName;
  };
  const name = (j?: JoinName) => (j && !Array.isArray(j) ? j.name : null);
  const booth = Array.isArray(r.photoboxes) ? r.photoboxes[0] : r.photoboxes;
  const receiptSettings = resolvePosReceiptSettings(booth?.print_settings, Boolean(booth));
  return {
    id: r.id,
    number: r.number,
    status: r.status,
    business_id: r.business_id,
    photobox_id: r.photobox_id,
    photobox_name: name(r.photoboxes),
    outlet_id: r.outlet_id,
    outlet_name: name(r.outlets),
    cashier_user_id: r.cashier_user_id,
    cashier_name: name(r.cashier),
    gross_amount: r.gross_amount,
    discount_amount: r.discount_amount,
    final_amount: r.final_amount,
    payment_method: r.payment_method,
    paid_at: r.paid_at,
    created_at: r.created_at,
    paper_width_mm: receiptSettings.paperWidthMm,
    print_mode: receiptSettings.printMode,
    auto_print: receiptSettings.autoPrint,
  };
}

function mapItem(row: unknown): PosOrderItemRow {
  const r = row as {
    id: string;
    pos_product_id: string | null;
    name_snapshot: string;
    sku_snapshot: string | null;
    unit_price_snapshot: number;
    quantity: number;
    subtotal: number;
  };
  return {
    id: r.id,
    pos_product_id: r.pos_product_id,
    name_snapshot: r.name_snapshot,
    sku_snapshot: r.sku_snapshot,
    unit_price_snapshot: r.unit_price_snapshot,
    quantity: r.quantity,
    subtotal: r.subtotal,
  };
}

async function fetchOrderDetail(
  supabase: ReturnType<typeof createServerClient>,
  businessId: string,
  orderId: string
): Promise<PosOrderDetail | null> {
  const { data, error } = await supabase
    .from("pos_orders")
    .select(ORDER_COLUMNS)
    .eq("id", orderId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memuat order POS");
  if (!data) return null;

  const { data: items, error: itemError } = await supabase
    .from("pos_order_items")
    .select(ITEM_COLUMNS)
    .eq("pos_order_id", orderId);
  if (itemError) throw new ApiError("INTERNAL", "Gagal memuat item order POS");

  return { order: mapOrder(data), items: (items ?? []).map(mapItem) };
}

/** Nomor order harian WIB — count hari itu + 1, retry 3× saat race (A14). */
async function nextPosOrderNumber(
  supabase: ReturnType<typeof createServerClient>,
  businessId: string
): Promise<string> {
  const { start, end } = posDayRange();
  const { count } = await supabase
    .from("pos_orders")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());
  return posOrderNumber((count ?? 0) + 1);
}

export async function createPosOrder(
  userId: string,
  businessId: string,
  input: PosOrderCreateInput
): Promise<PosOrderDetail> {
  const membership = await requirePosAccess(userId, businessId);
  if (!can(membership.role, "pos:sell")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin menjual di POS");
  }
  const parsed = posOrderCreateSchema.parse(input);

  const supabase = createServerClient();

  // Booth wajib milik tenant + pos_enabled (A13) — cross-tenant = 404.
  const { data: booth } = await supabase
    .from("photoboxes")
    .select("id, name, outlet_id, pos_enabled")
    .eq("id", parsed.photoboxId)
    .eq("business_id", businessId)
    .maybeSingle();
  const boothRow = (booth ?? null) as {
    id: string;
    name: string;
    outlet_id: string;
    pos_enabled: boolean;
  } | null;
  if (!boothRow) throw new ApiError("NOT_FOUND", "Booth tidak ditemukan");
  if (!boothRow.pos_enabled) {
    throw new ApiError("POS_BOOTH_DISABLED", "POS tidak aktif di booth ini");
  }

  // Produk di-fetch ulang dari DB — harga/total TIDAK pernah dari client (A8).
  const productIds = [...new Set(parsed.items.map((i) => i.productId))];
  const { data: productRows } = await supabase
    .from("pos_products")
    .select("id, name, sku, price, cost, stock, is_active")
    .eq("business_id", businessId)
    .in("id", productIds);
  const products = new Map(
    (
      (productRows ?? []) as {
        id: string;
        name: string;
        sku: string | null;
        price: number;
        cost: number | null;
        stock: number | null;
        is_active: boolean;
      }[]
    ).map((p) => [p.id, p])
  );

  const inactive: string[] = [];
  for (const item of parsed.items) {
    const p = products.get(item.productId);
    if (!p || !p.is_active) inactive.push(item.productId);
  }
  if (inactive.length > 0) {
    throw new ApiError("POS_PRODUCT_INACTIVE", "Ada produk yang sudah dinonaktifkan", {
      productIds: inactive,
    });
  }

  // Stock pre-check ringan — final tetap guarded UPDATE saat pay (R5).
  const shortfalls: { productId: string; name: string; stock: number; qty: number }[] = [];
  for (const item of parsed.items) {
    const p = products.get(item.productId);
    if (!p || p.stock === null) continue;
    const totalQty = parsed.items
      .filter((i) => i.productId === item.productId)
      .reduce((s, i) => s + i.qty, 0);
    if (p.stock < totalQty) {
      shortfalls.push({ productId: p.id, name: p.name, stock: p.stock, qty: totalQty });
    }
  }
  if (shortfalls.length > 0) {
    throw new ApiError("INSUFFICIENT_STOCK", "Stok tidak mencukupi", { items: shortfalls });
  }

  const totals = computePosTotals(
    parsed.items.map((i) => ({
      unitPrice: products.get(i.productId)?.price ?? 0,
      qty: i.qty,
    }))
  );

  // Insert order + items; retry saat nomor bentrok (race antar kasir) — A14.
  let orderId: string | null = null;
  let orderNumber = "";
  let lastError: { code?: string; message?: string } | null = null;
  for (let attempt = 0; attempt < 3 && !orderId; attempt++) {
    const number = await nextPosOrderNumber(supabase, businessId);
    const { data: orderRow, error: orderError } = await supabase
      .from("pos_orders")
      .insert({
        business_id: businessId,
        photobox_id: boothRow.id,
        outlet_id: boothRow.outlet_id,
        cashier_user_id: userId,
        number,
        status: "pending",
        gross_amount: totals.gross,
        discount_amount: totals.discount,
        final_amount: totals.final,
        payment_method: "cash",
      })
      .select("id")
      .single();
    const row = (orderRow ?? null) as { id: string } | null;
    if (row) {
      orderId = row.id;
      orderNumber = number;
      break;
    }
    lastError = orderError ?? null;
    if (orderError?.code !== "23505") {
      throw new ApiError("INTERNAL", "Gagal membuat order POS");
    }
  }
  if (!orderId) {
    throw new ApiError("INTERNAL", "Gagal membuat order POS (nomor bentrok)", {
      db_code: lastError?.code,
      db_message: lastError?.message,
    });
  }

  const { error: itemError } = await supabase.from("pos_order_items").insert(
    parsed.items.map((i) => {
      const p = products.get(i.productId)!;
      return {
        pos_order_id: orderId,
        pos_product_id: p.id,
        name_snapshot: p.name,
        sku_snapshot: p.sku,
        unit_price_snapshot: p.price,
        cost_snapshot: p.cost,
        quantity: i.qty,
        subtotal: p.price * i.qty,
      };
    })
  );
  if (itemError) throw new ApiError("INTERNAL", "Gagal menyimpan item order POS");

  await insertAudit({
    actorId: userId,
    businessId,
    action: "pos.order.create",
    target: orderId,
    meta: { number: orderNumber, items: parsed.items.length, final: totals.final },
  });

  const detail = await fetchOrderDetail(supabase, businessId, orderId);
  if (!detail) throw new ApiError("INTERNAL", "Order POS tidak ditemukan setelah dibuat");
  return detail;
}

export async function cancelPosOrder(
  userId: string,
  businessId: string,
  orderId: string
): Promise<void> {
  const membership = await requirePosAccess(userId, businessId);
  if (!can(membership.role, "pos:sell")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin membatalkan order POS");
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("pos_orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("business_id", businessId)
    .eq("status", "pending") // conditional UPDATE: single winner (S8)
    .select("id, number")
    .maybeSingle();

  if (error) throw new ApiError("INTERNAL", "Gagal membatalkan order POS");
  if (!data) {
    // 0 rows: bukan milik tenant (=404) atau bukan pending (=409).
    const { data: exists } = await supabase
      .from("pos_orders")
      .select("id")
      .eq("id", orderId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (!exists) throw new ApiError("NOT_FOUND", "Order tidak ditemukan");
    throw new ApiError("POS_ORDER_NOT_PAYABLE", "Order tidak berstatus pending");
  }

  await insertAudit({
    actorId: userId,
    businessId,
    action: "pos.order.cancel",
    target: orderId,
    meta: { number: data.number },
  });
}

/**
 * Bayar manual (cash/bank_transfer/other) — offline-only (A2).
 * REPORTING ONLY: insert transactions paid TANPA creditBalance (A3).
 * Idempotent: exists-check pos_order_id + conditional UPDATE single winner.
 */
export async function payPosOrderManually(
  userId: string,
  businessId: string,
  input: PosManualPayInput
): Promise<{ orderId: string }> {
  const membership = await requirePosAccess(userId, businessId);
  if (!can(membership.role, "pos:sell")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin menerima pembayaran POS");
  }
  const parsed = posManualPaySchema.parse(input);

  const supabase = createServerClient();

  const { data: orderData } = await supabase
    .from("pos_orders")
    .select(
      "id, number, status, outlet_id, photobox_id, gross_amount, discount_amount, final_amount, cashier_user_id"
    )
    .eq("id", parsed.orderId)
    .eq("business_id", businessId)
    .maybeSingle();
  const order = (orderData ?? null) as {
    id: string;
    number: string;
    status: string;
    outlet_id: string | null;
    photobox_id: string;
    gross_amount: number;
    discount_amount: number;
    final_amount: number;
    cashier_user_id: string;
  } | null;
  if (!order) throw new ApiError("NOT_FOUND", "Order tidak ditemukan");

  // Idempotency DULU, sebelum cek status. Retry setelah RPC sukses (order
  // sudah paid) harus mengembalikan sukses yang sama, bukan 409. Ini penting
  // untuk tombol "Bayar" yang di-retry setelah timeout jaringan: uang sudah
  // diterima, klien tidak boleh disuruh membayar/membatalkan order.
  const { data: existingTx } = await supabase
    .from("transactions")
    .select("id")
    .eq("pos_order_id", parsed.orderId)
    .maybeSingle();
  const decision = classifyPosManualPay({
    status: order.status,
    hasExistingTransaction: Boolean(existingTx),
  });
  if (decision === "already-settled") return { orderId: parsed.orderId };
  if (decision === "not-payable") {
    throw new ApiError("POS_ORDER_NOT_PAYABLE", "Order tidak berstatus pending");
  }

  const tz = membership.business.timezone ?? "Asia/Jakarta";
  const number = formatTxNumber(todayISO(tz), randomUUID().replace(/-/g, "").slice(0, 6));

  // Atomic: conditional UPDATE pos_orders pending→paid + INSERT transactions
  // in one DB transaction (0026 RPC). Eliminates partial-failure window where
  // order is paid but transaction row is missing.
  const { data: txId, error: rpcError } = await supabase.rpc("pos_complete_payment", {
    p_order_id: parsed.orderId,
    p_business: businessId,
    p_method: parsed.method,
    p_cashier: order.cashier_user_id,
    p_tx_number: number,
    p_outlet_id: order.outlet_id,
    p_photobox_id: order.photobox_id,
    p_gross: order.gross_amount,
    p_discount: order.discount_amount,
    p_final: order.final_amount,
  });
  if (rpcError) {
    // 23505 = unique violation on idx_tx_pos_order_unique → already processed (race).
    if ((rpcError as { code?: string }).code === "23505") return { orderId: parsed.orderId };
    throw new ApiError("INTERNAL", "Gagal menyelesaikan pembayaran POS");
  }
  if (!txId) {
    // RPC returned NULL: order no longer pending (race or already processed).
    const { data: winnerTx } = await supabase
      .from("transactions")
      .select("id")
      .eq("pos_order_id", parsed.orderId)
      .maybeSingle();
    if (winnerTx) return { orderId: parsed.orderId };
    throw new ApiError("POS_ORDER_NOT_PAYABLE", "Order sudah tidak pending");
  }

  // Stock decrement guarded (RPC atomic) — shortfall TIDAK membatalkan order
  // yang sudah paid: kasir menerima uang; dicatat untuk rekonsiliasi (R5).
  const { data: items } = await supabase
    .from("pos_order_items")
    .select("pos_product_id, quantity, name_snapshot")
    .eq("pos_order_id", order.id);
  const stockItems = (
    (items ?? []) as {
      pos_product_id: string | null;
      quantity: number;
      name_snapshot: string;
    }[]
  ).filter((item) => item.pos_product_id !== null);
  await Promise.all(
    stockItems.map(async (item) => {
      const { data: ok } = await supabase.rpc("pos_decrement_stock", {
        p_business: businessId,
        p_product: item.pos_product_id!,
        p_qty: item.quantity,
      });
      if (ok !== true) {
        console.warn("[pos] stock shortfall:", {
          orderId: order.id,
          product: item.name_snapshot,
          qty: item.quantity,
        });
        await insertAudit({
          actorId: null,
          businessId,
          action: "pos.stock.shortfall",
          target: order.id,
          meta: { product: item.name_snapshot, qty: item.quantity },
        });
      }
    })
  );

  await insertAudit({
    actorId: userId,
    businessId,
    action: "pos.order.paid.manual",
    target: order.id,
    meta: { number: order.number, method: parsed.method, amount: order.final_amount },
  });

  return { orderId: order.id };
}

export async function getPosOrder(
  userId: string,
  businessId: string,
  orderId: string
): Promise<PosOrderDetail> {
  const membership = await requirePosAccess(userId, businessId);
  if (!can(membership.role, "pos:read")) {
    throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  }
  const supabase = createServerClient();
  const detail = await fetchOrderDetail(supabase, businessId, orderId);
  if (!detail) throw new ApiError("NOT_FOUND", "Order tidak ditemukan");
  return detail;
}
