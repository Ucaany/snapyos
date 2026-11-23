"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/admin/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/admin/ui/tabs";

/**
 * Tab status berbasis shadcn Tabs. Nilai tab disimpan di URL (`?status=`),
 * jadi tetap server-rendered dan bisa di-bookmark.
 */
export function AdminStatusTabs({
  tabs,
  active,
  basePath,
}: {
  tabs: Array<{ key: string; label: string; count: number }>;
  active: string;
  basePath: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <Tabs
      value={active}
      onValueChange={(value) => {
        if (typeof value === "string") {
          const params = new URLSearchParams(searchParams.toString());
          params.set("status", value);
          params.delete("page");
          router.push(`${basePath}?${params.toString()}`);
        }
      }}
    >
      <TabsList variant="line" className="w-full justify-start overflow-x-auto">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.key} value={tab.key} className="flex-none gap-2">
            {tab.label}
            <Badge
              variant={tab.key === active ? "default" : "secondary"}
              className="h-5 px-1.5 tabular-nums"
            >
              {String(tab.count).padStart(2, "0")}
            </Badge>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
