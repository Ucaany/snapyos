import { redirect } from "next/navigation";

import { destinationFor } from "@/lib/destination";
import { getUserMemberships, requireUser } from "@/lib/tenant";

/**
 * Layout /onboarding — protected, tanpa shell dashboard (docs/04 §4 onboarding,
 * docs/13 §13.6). Wajib login; jika user sudah punya membership, redirect ke
 * destination per role (owner → /dashboard, staff-only → /staff).
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const memberships = await getUserMemberships(user.id);
  if (memberships.length > 0) redirect(destinationFor(memberships));

  return <>{children}</>;
}
