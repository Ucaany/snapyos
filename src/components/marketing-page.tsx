import Link from "next/link";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { buttonVariants } from "@/components/ui/button-variants";

export function MarketingPage({
  eyebrow,
  title,
  description,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="marketing-page min-h-[100dvh] bg-bg text-ink">
      <Header />
      <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
        <header className="max-w-3xl border-b-2 border-ink pb-10">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ink">{`{${eyebrow}}`}</p>
          <h1 className="mt-4 font-display text-balance text-4xl uppercase leading-[0.95] tracking-tight md:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
            {description}
          </p>
          {updated ? (
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Terakhir diperbarui {updated}
            </p>
          ) : null}
        </header>
        <div className="mt-10">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}

export function MarketingCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111]">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink">{title}</p>
      <div className="mt-2 text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
        {children}
      </div>
    </div>
  );
}

export function MarketingLinks() {
  return (
    <div className="flex flex-wrap gap-3">
      <Link className={buttonVariants()} href="/register">
        Konsultasi Bisnis
      </Link>
      <Link className={buttonVariants({ variant: "outline" })} href="/">
        Kembali ke beranda
      </Link>
    </div>
  );
}
