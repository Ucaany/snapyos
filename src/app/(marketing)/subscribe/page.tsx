import type { Metadata } from "next";

import { SubscribeForm } from "@/components/subscribe-form";
import { getPublicPlans, getPublicAddOns } from "@/server/catalog";
import { addOnPriceForCycle } from "@/lib/subscription-math";

export const metadata: Metadata = {
  title: "Berlangganan | SnapyOS",
  description: "Konsultasi paket dan add-on SnapyOS untuk bisnis photobox Anda via WhatsApp.",
};

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; addons?: string }>;
}) {
  const params = await searchParams;
  const [plans, addOns] = await Promise.all([getPublicPlans(), getPublicAddOns()]);

  const planCode = params.plan ?? "";
  const addOnCodes = (params.addons ?? "").split(",").filter(Boolean);

  const plan = plans.find((p) => p.code === planCode) ?? null;
  const selectedAddOns = addOns.filter(
    (a) =>
      addOnCodes.includes(a.code) &&
      addOnPriceForCycle(a, plan?.billing_cycle ?? "monthly") !== null
  );
  const planRequested = planCode !== "";

  return (
    <div>
      <SubscribeForm plan={plan} addOns={selectedAddOns} planRequested={planRequested} />
    </div>
  );
}
