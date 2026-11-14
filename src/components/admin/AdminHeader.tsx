import { AdminBreadcrumb } from "@/components/admin/AdminBreadcrumb";
import { AdminClock } from "@/components/admin/AdminClock";
import { AdminThemeToggle } from "@/components/admin/AdminThemeToggle";
import { Separator } from "@/components/admin/ui/separator";
import { SidebarTrigger } from "@/components/admin/ui/sidebar";

/**
 * Header sidebar-08: trigger + separator + breadcrumb. Tidak ada header
 * custom lain; identitas admin tinggal di `NavUser` pada footer sidebar.
 */
export function AdminHeader({ dark = false }: { dark?: boolean }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2 px-4 md:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <AdminBreadcrumb />
      </div>
      <div className="flex items-center gap-3 px-4 md:px-6">
        <AdminClock />
        <AdminThemeToggle dark={dark} />
      </div>
    </header>
  );
}
