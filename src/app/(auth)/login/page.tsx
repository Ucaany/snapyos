import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPage } from "@/components/auth-block";
import { destinationForUser } from "@/lib/destination";
import { getUserMemberships, requireUser } from "@/lib/tenant";
import { isAdminUser } from "@/server/admin";

export const metadata: Metadata = {
  title: "Masuk | SnapyOS",
};

export default async function LoginPage() {
  const user = await requireUser();
  if (user) {
    const memberships = await getUserMemberships(user.id);
    redirect(destinationForUser(memberships, { isAdmin: isAdminUser(user) }));
  }
  return (
    <div>
      <AuthPage />
    </div>
  );
}
