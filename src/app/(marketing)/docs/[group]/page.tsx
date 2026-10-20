import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocArticleBlock } from "@/components/docs/doc-article";
import {
  DOC_GROUPS,
  HELP_ARTICLES,
  getDocBySlug,
  getGroupBySlug,
  getPrevNextGroup,
} from "@/server/help";

type Props = { params: Promise<{ group: string }> };

export function generateStaticParams() {
  return DOC_GROUPS.map((g) => ({ group: g.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { group } = await params;
  const g = getGroupBySlug(group);
  if (!g) return { title: "Panduan | SnapyOS" };
  return {
    title: `Panduan ${g.title} | SnapyOS`,
    description: g.desc,
  };
}

export default async function DocsGroupPage({ params }: Props) {
  const { group } = await params;
  const g = getGroupBySlug(group);

  if (!g) {
    const article = HELP_ARTICLES.find((a) => a.slug === group);
    if (article) {
      const owner = DOC_GROUPS.find((x) => x.slugs.includes(article.slug));
      redirect(owner ? `/docs/${owner.slug}#${article.slug}` : `/docs#${article.slug}`);
    }
    notFound();
  }

  const { prev, next } = getPrevNextGroup(g.slug);
  const docs = g.slugs
    .map((slug) => getDocBySlug(slug))
    .filter((d): d is NonNullable<typeof d> => Boolean(d));

  return (
    <div className="relative min-h-[100dvh] overflow-x-clip bg-bg text-ink">
      <div className="relative">
        <Header />
      </div>

      <main id="top" className="relative space-y-12 overflow-x-clip pb-4 md:space-y-16">
        <section className="mx-auto w-full max-w-5xl px-4 pt-12 md:px-8 md:pt-16">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-ink [@media(pointer:coarse)]:min-h-11"
          >
            <ArrowLeft className="size-4" />
            Semua kategori
          </Link>
          <div className="mt-6 flex max-w-3xl flex-col items-start gap-5">
            <Badge variant="secondary">Panduan {g.title}</Badge>
            <h1 className="text-balance text-4xl font-display font-black uppercase leading-[0.95] tracking-tight md:text-5xl">
              {g.title}: {g.desc}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
              {docs.length} panduan di kategori ini.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 md:px-8">
          <div className="grid min-w-0 grid-cols-1 gap-10 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14">
            <aside className="hidden lg:block">
              <nav
                aria-label="Navigasi kategori"
                className="sticky top-20 max-h-[calc(100dvh-6rem)] space-y-1 overflow-y-auto border-r border-ink pr-8 text-sm"
              >
                <Link
                  href="/docs"
                  className="block py-1 text-muted-foreground hover:text-ink hover:underline"
                >
                  Ringkasan
                </Link>
                {DOC_GROUPS.map((x) => (
                  <Link
                    key={x.slug}
                    href={`/docs/${x.slug}`}
                    aria-current={x.slug === g.slug ? "page" : undefined}
                    className={
                      x.slug === g.slug
                        ? "block border-l-2 border-ink py-1 pl-3 font-medium text-ink"
                        : "block border-l-2 border-transparent py-1 pl-3 text-muted-foreground hover:text-ink hover:underline"
                    }
                  >
                    {x.title}
                  </Link>
                ))}
                <div className="pt-4">
                  <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    Di halaman ini
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {docs.map((d) => (
                      <li key={d.slug}>
                        <a
                          href={`#${d.slug}`}
                          className="text-muted-foreground hover:text-ink hover:underline"
                        >
                          {d.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </nav>
            </aside>

            <div className="min-w-0 max-w-full lg:pl-2">
              <div
                className="flex max-w-full gap-2 overflow-x-auto pb-2 lg:hidden"
                aria-label="Pintasan kategori"
              >
                {DOC_GROUPS.map((x) => (
                  <Link
                    key={x.slug}
                    href={`/docs/${x.slug}`}
                    // Chip pintasan ini kontrol sentuh penuh: 32px terlalu pendek
                    // untuk jempol, jadi dinaikkan ke 44px (antislop R-03).
                    className={`inline-flex shrink-0 items-center [@media(pointer:coarse)]:min-h-11 ${
                      x.slug === g.slug
                        ? "rounded-none border-2 border-ink bg-accent px-3 py-1.5 text-xs font-semibold"
                        : "rounded-none border border-ink px-3 py-1.5 text-xs font-medium text-muted-foreground"
                    }`}
                  >
                    {x.title}
                  </Link>
                ))}
              </div>

              <div className="space-y-16">
                {docs.map((doc) => (
                  <DocArticleBlock key={doc.slug} article={doc} />
                ))}
              </div>

              <nav
                aria-label="Pindah kategori"
                className="mt-16 grid gap-3 border-t border-ink pt-8 sm:grid-cols-2"
              >
                <div>
                  {prev ? (
                    <Link
                      href={`/docs/${prev.slug}`}
                      className="group flex h-full flex-col gap-1 rounded-none border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111]"
                    >
                      <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Sebelumnya
                      </span>
                      <span className="text-sm font-semibold group-hover:underline">
                        {prev.title}
                      </span>
                      <span className="text-xs leading-5 text-muted-foreground">{prev.desc}</span>
                    </Link>
                  ) : (
                    <Link
                      href="/docs"
                      className="flex h-full flex-col gap-1 rounded-none border-2 border-dashed border-ink p-5 text-muted-foreground"
                    >
                      <span className="text-xs font-medium uppercase tracking-widest">
                        Sebelumnya
                      </span>
                      <span className="text-sm font-semibold">Ringkasan dokumentasi</span>
                    </Link>
                  )}
                </div>
                <div>
                  {next ? (
                    <Link
                      href={`/docs/${next.slug}`}
                      className="group flex h-full flex-col items-end gap-1 rounded-none border-2 border-ink bg-surface p-5 text-right shadow-[4px_4px_0_0_#111111]"
                    >
                      <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Berikutnya
                        <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" />
                      </span>
                      <span className="text-sm font-semibold group-hover:underline">
                        {next.title}
                      </span>
                      <span className="text-xs leading-5 text-muted-foreground">{next.desc}</span>
                    </Link>
                  ) : (
                    <Link
                      href="/docs"
                      className="flex h-full flex-col items-end gap-1 rounded-none border-2 border-dashed border-ink p-5 text-right text-muted-foreground"
                    >
                      <span className="text-xs font-medium uppercase tracking-widest">
                        Berikutnya
                      </span>
                      <span className="text-sm font-semibold">Ringkasan dokumentasi</span>
                    </Link>
                  )}
                </div>
              </nav>

              <div className="mt-8">
                <Button variant="outline" nativeButton={false} render={<Link href="/docs" />}>
                  <ArrowLeft data-icon="inline-start" />
                  Kembali ke ringkasan
                </Button>
              </div>
            </div>

            <aside className="hidden xl:block">
              <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto border-l border-ink pl-8 text-sm">
                <p className="text-sm font-semibold">Di halaman ini</p>
                <ul className="mt-3 space-y-2">
                  {docs.map((d) => (
                    <li key={d.slug}>
                      <a
                        href={`#${d.slug}`}
                        className="text-muted-foreground hover:text-ink hover:underline"
                      >
                        {d.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </section>

        <section className="space-y-8">
          <div className="mx-auto w-full max-w-5xl px-4 md:px-8">
            <div className="border-t border-ink pt-8">
              <p className="text-sm font-semibold text-ink">Catatan sumber kebenaran.</p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
                Panduan ini disusun dari perilaku kode berjalan SnapyOS. Backend menghitung ulang
                pembayaran. Dana QRIS masuk langsung ke rekening merchant owner. Hasil foto
                tersimpan 1 sampai 3 hari mengikuti pengaturan booth.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
