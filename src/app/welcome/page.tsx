import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { destinationFor } from "@/lib/destination";
import { getUserMemberships, requireUser } from "@/lib/tenant";
import { logoutToLoginAction } from "@/server/auth-actions";

export const metadata: Metadata = { title: "Selamat Datang | SnapyOS" };

export default async function WelcomePage() {
  const user = await requireUser();
  if (!user) redirect("/login");
  const memberships = await getUserMemberships(user.id);
  const destination = destinationFor(memberships);
  if (destination !== "/welcome") redirect(destination);
  return (
    <main className="min-h-[100dvh] bg-bg px-5 py-8 text-ink sm:px-8 lg:py-12">
      <div className="mx-auto grid max-w-[1100px] gap-6">
        <header className="border-2 border-ink bg-surface p-7 shadow-[6px_6px_0_0_#111111] sm:p-10">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {"/// SELAMAT DATANG"}
          </p>
          <p className="mt-3 font-mono text-sm font-bold text-ink">{user.name ?? user.email}</p>
          <h1 className="mt-4 max-w-[14ch] font-display text-5xl uppercase leading-[.92] tracking-tight text-ink sm:text-7xl">
            Pilih cara Anda masuk ke SnapyOS.
          </h1>
          <p className="mt-5 max-w-[38rem] font-sans text-base leading-7 text-muted-foreground">
            Buat workspace bila Anda pemilik bisnis. Bila Anda bergabung sebagai staf, mintalah
            undangan dari owner.
          </p>
        </header>
        <div className="grid gap-5 md:grid-cols-2">
          <section className="border-2 border-ink bg-accent p-7 shadow-[6px_6px_0_0_#111111] sm:p-9">
            <Image
              src="/avatars/5.svg"
              alt="Ilustrasi pemilik bisnis"
              width={220}
              height={220}
              className="h-auto w-32"
            />
            <h2 className="mt-7 font-display text-4xl uppercase tracking-tight text-ink">
              Saya pemilik bisnis
            </h2>
            <p className="mt-3 max-w-[31rem] font-sans text-base leading-7 text-ink">
              Buat workspace photobox untuk mengatur booth, paket, dan operasional dari satu tempat.
            </p>
            <Link
              href="/onboarding/create-business"
              className="mt-7 inline-flex border-2 border-ink bg-ink px-6 py-3 font-mono text-sm font-bold uppercase tracking-[0.08em] text-bg shadow-[4px_4px_0_0_#111111] transition-transform active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
            >
              Buat workspace bisnis
            </Link>
          </section>
          <section className="border-2 border-ink bg-surface p-7 shadow-[6px_6px_0_0_#111111] sm:p-9">
            <Image
              src="/avatars/8.svg"
              alt="Ilustrasi staf photobox"
              width={220}
              height={220}
              className="h-auto w-32"
            />
            <h2 className="mt-7 font-display text-4xl uppercase tracking-tight text-ink">
              Saya bergabung sebagai staf
            </h2>
            <p className="mt-3 max-w-[31rem] font-sans text-base leading-7 text-muted-foreground">
              Kirim email akun Anda ke owner, lalu mereka dapat mengundang Anda melalui workspace
              bisnis.
            </p>
            <p className="mt-6 border-2 border-ink bg-bg px-4 py-3 font-mono text-sm font-bold break-all text-ink">
              {user.email}
            </p>
          </section>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="font-mono text-sm font-bold uppercase tracking-[0.08em] text-ink underline decoration-2 underline-offset-4"
          >
            Kembali ke beranda
          </Link>
          <form action={logoutToLoginAction}>
            <button
              type="submit"
              className="border-2 border-ink bg-surface px-6 py-3 font-mono text-sm font-bold uppercase tracking-[0.08em] shadow-[4px_4px_0_0_#111111] transition-transform active:translate-x-[4px] active:translate-y-[4px] active:shadow-none"
            >
              Keluar
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
