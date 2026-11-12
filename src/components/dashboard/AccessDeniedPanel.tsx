import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const RESOURCE_LABEL = {
  revenue: "data revenue",
  finance: "data finance",
  report: "akses report",
} as const;

/**
 * Panel akses terbatas untuk halaman yang dijaga `can(role, "...:read")`.
 * Tanpa "use client": aman dirender dari server component.
 */
export function AccessDeniedPanel({ resource }: { resource: keyof typeof RESOURCE_LABEL }) {
  return (
    <Card className="max-w-xl border-destructive">
      <CardHeader>
        <CardTitle>Akses terbatas</CardTitle>
        <CardDescription>
          Role Anda tidak melihat {RESOURCE_LABEL[resource]}. Hubungi owner untuk akses penuh.
        </CardDescription>
      </CardHeader>
      <Link
        href="/dashboard"
        className="inline-flex min-h-11 w-fit items-center gap-2 border-2 border-ink bg-accent px-4 font-mono text-xs font-bold uppercase tracking-[0.08em] shadow-hard-sm"
      >
        Kembali ke Dashboard
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </Card>
  );
}
