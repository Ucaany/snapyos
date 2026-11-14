import { cookies } from "next/headers";

/**
 * State sidebar admin dibaca dari cookie yang ditulis `SidebarProvider`
 * (`sidebar_state`). Hanya dipakai layout admin; shell owner memakai
 * `snapyos_sidebar_collapsed` lewat `CollapsibleShell`.
 */
export async function getAdminSidebarOpen(): Promise<boolean> {
  const store = await cookies();
  const value = store.get("sidebar_state")?.value;
  return value === undefined ? true : value === "true";
}
