import { redirect } from "next/navigation";

import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { hasPosEntitlement } from "@/server/pos-entitlement";

/**
 * Layout terminal POS — guard UX (docs/pos/03 §5.1): user → business aktif →
 * entitlement. Keamanan sebenarnya tetap di requirePosAccess per action (R4).
 * Staff shell (`/staff`) tidak menutup akses `/pos` — route group terpisah.
 */
export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  if (!(await hasPosEntitlement(active.business.id))) {
    redirect("/dashboard/pos");
  }

  return <>{children}</>;
}
