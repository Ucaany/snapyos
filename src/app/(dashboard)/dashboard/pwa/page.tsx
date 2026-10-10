import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, MonitorSmartphone, Smartphone, Tablet } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button";
import { can } from "@/lib/rbac";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { hasFeature } from "@/server/feature-gate";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Unduh PWA | SnapyOS" };

const STEPS = [
  {
    icon: Smartphone,
    title: "Android Phone / Tablet",
    body: "Buka URL kiosk di Chrome, lalu ketuk menu (⋮) → “Tambahkan ke layar utama”. Aplikasi terpasang fullscreen sebagai kiosk.",
  },
  {
    icon: Tablet,
    title: "iPad / iPhone (iOS)",
    body: "Buka URL kiosk di Safari, ketuk tombol Bagikan → “Tambahkan ke Layar Utama”. Aplikasi muncul sebagai ikon di homescreen.",
  },
  {
    icon: MonitorSmartphone,
    title: "Mulai pairing",
    body: "Setelah terpasang, buka aplikasi → masukkan kode aktivasi 6 karakter dari menu Photobox → Perangkat untuk menghubungkan booth.",
  },
] as const;

/** Owner unduh/pasang PWA mobile (Android/tablet/iOS) — panduan singkat + link pairing. */
export default async function PwaPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  if (!can(active.role, "photobox:write")) redirect("/dashboard");
  if (!(await hasFeature(active.business.id, "pwa_kiosk"))) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <PageHeader
        eyebrow="PWA MOBILE"
        title="Unduh PWA"
        description="Pasang SnapyOS sebagai aplikasi kiosk di Android, tablet, atau iOS — tanpa App Store, tanpa install file."
      />

      <ol className="grid grid-cols-1 gap-[2px] border-2 border-ink bg-ink md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-3 bg-surface p-5">
            <span className="font-mono text-xs font-bold text-accent-2">{`/// 0${i + 1}`}</span>
            <s.icon className="size-8" aria-hidden />
            <p className="font-display text-base font-bold uppercase tracking-tight">{s.title}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-4 border-2 border-ink bg-accent/20 p-4">
        <p className="max-w-[60ch] text-sm leading-relaxed">
          Sudah terpasang? Buka halaman photobox untuk membuat kode aktivasi dan menghubungkan
          perangkat kiosk.
        </p>
        <Link
          href="/dashboard/photoboxes"
          className={cn(buttonVariants({ variant: "outline" }), "ml-auto")}
        >
          Buka pairing <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
