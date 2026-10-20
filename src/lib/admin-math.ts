/**
 * Admin platform math — docs/10 §10.1/§10.3. Pure module (unit-testable).
 * Uang selalu integer IDR (docs/02).
 */

import { computePlatformFee } from "./checkout-math.ts";

export type PlanPrice = {
  price_monthly: number;
};

export type MrrItem = { plan: PlanPrice | null };

/** Harga setara bulanan — monthly-only (yearly billing dihapus dari runtime). */
export function monthlyEquivalent(plan: PlanPrice): number {
  return plan.price_monthly;
}

/** MRR = Σ price_monthly plan dari subscription aktif (docs/10 §10.1). */
export function sumMrr(items: MrrItem[]): number {
  return items.reduce((sum, item) => (item.plan ? sum + monthlyEquivalent(item.plan) : sum), 0);
}

export type FeePolicy = { percent: number; flat: number };

export type PaymentStatusCounts = Record<string, number>;

/** Ringkasan payment admin (docs/10 §10.3): volume, counts, gross/fee/net per tenant. */
export function paymentSummary(
  payments: {
    business_id: string;
    business_name?: string;
    final_amount: number;
    status: string;
    provider: string;
  }[],
  feeByBusiness: Map<string, FeePolicy>
) {
  const counts: PaymentStatusCounts = {};
  const byProvider = new Map<string, { count: number; volume: number }>();
  const byTenant = new Map<
    string,
    {
      businessId: string;
      businessName: string;
      gross: number;
      fee: number;
      net: number;
      count: number;
    }
  >();
  let volume = 0;
  let refunded = 0;
  let gross = 0;
  let fee = 0;

  for (const p of payments) {
    counts[p.status] = (counts[p.status] ?? 0) + 1;
    const prov = byProvider.get(p.provider) ?? { count: 0, volume: 0 };
    prov.count += 1;
    prov.volume += p.final_amount;
    byProvider.set(p.provider, prov);

    if (p.status === "paid") {
      volume += p.final_amount;
      gross += p.final_amount;
      const policy = feeByBusiness.get(p.business_id);
      const tenantFee = policy
        ? computePlatformFee(p.final_amount, policy.percent, policy.flat)
        : 0;
      if (policy) fee += tenantFee;

      const t = byTenant.get(p.business_id) ?? {
        businessId: p.business_id,
        businessName: p.business_name ?? "-",
        gross: 0,
        fee: 0,
        net: 0,
        count: 0,
      };
      t.gross += p.final_amount;
      t.fee += tenantFee;
      t.net = Math.max(0, t.gross - t.fee);
      t.count += 1;
      byTenant.set(p.business_id, t);
    } else if (p.status === "refunded") {
      refunded += p.final_amount;
    }
  }

  return {
    volume,
    refunded,
    gross,
    fee,
    net: Math.max(0, gross - fee),
    counts,
    byProvider: [...byProvider.entries()]
      .map(([provider, v]) => ({ provider, ...v }))
      .sort((a, b) => b.volume - a.volume),
    byTenant: [...byTenant.values()].sort((a, b) => b.gross - a.gross),
  };
}

/** Tambah hari ke ISO timestamp (perpanjang periode subscription, docs/10 §10.2). */
export function extendIsoDays(iso: string | null | undefined, days: number): string {
  const base = iso ? new Date(iso).getTime() : Date.now();
  const future = Math.max(base, Date.now()) + days * 86_400_000;
  return new Date(future).toISOString();
}
