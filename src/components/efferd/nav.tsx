import type { SidebarNavGroup } from "@/components/efferd/app-shared";

/**
 * Adapter nav SnapyOS → bentuk sidebar @efferd/app-shell-3.
 * Sumber data tetap satu: `buildNavGroups` (owner), `NAV_GROUPS` (admin),
 * `STAFF_NAV` (staff). Grup kita datar — tidak ada submenu yang dikarang.
 * Status aktif dihitung di client (`nav-group.tsx`) dari `usePathname`.
 */

type SourceItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type SourceGroup = { label: string; items: SourceItem[] };

export function toEfferdNav(groups: SourceGroup[]): SidebarNavGroup[] {
  return groups.map((group) => ({
    label: group.label,
    items: group.items.map((item) => {
      const Icon = item.icon;
      return { title: item.label, path: item.href, icon: <Icon className="size-4" /> };
    }),
  }));
}
