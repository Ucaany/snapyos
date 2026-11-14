"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

const ADMIN_THEME_COOKIE = "admin-theme";

/** Simpan preferensi tema admin (scoped `/admin`, tidak menyentuh shell lain). */
export async function setAdminTheme(theme: "light" | "dark"): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/admin");
}
