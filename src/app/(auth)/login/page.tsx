import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPage } from "@/components/auth-block";
import { destinationFor } from "@/lib/destination";
import { getUserMemberships, requireUser } from "@/lib/tenant";
import { isAdminEmail } from "@/server/admin";

export const metadata: Metadata = {
  title: "Masuk — SnapyOS",
};

export default async function LoginPage() {
  const user = await requireUser();
  if (user) {
    if (user.role === "admin" || isAdminEmail(user.email)) redirect("/admin");
    const memberships = await getUserMemberships(user.id);
    redirect(destinationFor(memberships));
  }
  return (
    <div>
      <AuthPage />
    </div>
  );
}
