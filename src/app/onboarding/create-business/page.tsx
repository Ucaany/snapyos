import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateBusinessForm } from "@/components/onboarding/CreateBusinessForm";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/tenant";
import { logoutToLoginAction } from "@/server/auth-actions";

export const metadata: Metadata = { title: "Buat Bisnis | SnapyOS" };

export default async function CreateBusinessPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  return (
    <main className="relative min-h-[100dvh] bg-background px-5 py-8 sm:px-8 lg:py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-full [background-image:linear-gradient(to_right,oklch(0.145_0_0/0.06)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.145_0_0/0.06)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div className="relative mx-auto max-w-[900px]">
        <div className="flex items-center justify-between gap-4 border-2 border-ink bg-surface p-2 shadow-[4px_4px_0_0_#111111]">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            className="min-h-11 rounded-none border-2 border-ink bg-surface font-mono text-[11px] uppercase tracking-[0.16em] text-ink shadow-[2px_2px_0_0_#111111] hover:bg-muted active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            render={<Link href="/welcome" />}
          >
            {"<< Kembali"}
          </Button>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground sm:inline">
              {user.name ?? user.email}
            </span>
            <form action={logoutToLoginAction}>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 rounded-none font-mono text-[11px] uppercase tracking-[0.16em] text-ink hover:bg-muted"
              >
                Keluar
              </Button>
            </form>
          </div>
        </div>

        <header className="mt-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {"Workspace baru · 01/01"}
          </p>
          <h1 className="font-display mt-4 text-5xl uppercase leading-[.92] tracking-tight text-ink sm:text-7xl">
            Mari beri rumah untuk bisnis Anda.
          </h1>
          <p className="mt-5 max-w-[38rem] text-base leading-7 text-muted-foreground">
            Lengkapi informasi dasar. Setelah itu Anda dapat menambahkan outlet dan photobox dari
            workspace.
          </p>
        </header>

        <section className="mt-10 border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111] sm:p-10">
          <CreateBusinessForm />
        </section>
      </div>
    </main>
  );
}
