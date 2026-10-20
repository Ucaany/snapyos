import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PosTerminal } from "@/components/pos/PosTerminal";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { listPosBooths, listPosProducts } from "@/server/pos-products";

export const metadata: Metadata = {
  title: "Terminal Kasir | SnapyOS",
};

/** /pos/terminal?photobox=<id> — terminal kasir full-screen per booth (docs/pos/03 §5.3). */
export default async function PosTerminalPage({
  searchParams,
}: {
  searchParams: Promise<{ photobox?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const { photobox: photoboxId } = await searchParams;
  if (!photoboxId) redirect("/pos");

  // Booth wajib milik tenant + pos_enabled — server-side (S6).
  const booths = await listPosBooths(user.id, active.business.id);
  const booth = booths.find((b) => b.id === photoboxId && b.pos_enabled);
  if (!booth) redirect("/pos");

  const products = await listPosProducts(user.id, active.business.id, { activeOnly: true });

  return (
    <PosTerminal
      booth={{ id: booth.id, name: booth.name, outletName: booth.outlet_name }}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        price: p.price,
        stock: p.stock,
        image_url: p.image_url,
        description: p.description,
      }))}
      cashierName={user.name ?? user.email ?? null}
      businessName={active.business.name}
    />
  );
}
