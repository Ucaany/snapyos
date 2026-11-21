import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CallToAction } from "@/components/cta-3";
import { CategoryBrowser } from "@/components/docs/category-browser";
import { DOC_GROUPS, getDocBySlug } from "@/server/help";

export const metadata: Metadata = {
  title: "Dokumentasi | SnapyOS",
  description:
    "Panduan SnapyOS untuk customer photobox dan owner bisnis. Alur sesi foto, cara bayar QRIS, hasil online, setup booth, dashboard, dan troubleshooting.",
};

const FLOW = [
  {
    no: "01",
    title: "Pilih paket",
    desc: "Harga, jumlah foto, dan jumlah cetak tertulis jelas di kartu paket.",
  },
  {
    no: "02",
    title: "Bayar",
    desc: "Scan QRIS, pakai voucher, atau tunai via operator. Timer mulai setelah paid.",
  },
  {
    no: "03",
    title: "Pilih frame",
    desc: "Semua frame aktif dapat dipilih; jumlah capture mengikuti slot frame.",
  },
  {
    no: "04",
    title: "Ambil foto",
    desc: "Ikuti hitungan 3, 2, 1. Retake mengikuti pengaturan booth (default 1 kali) selama durasi sesi berjalan.",
  },
  {
    no: "05",
    title: "Unduh hasil",
    desc: "Cetak otomatis jalan, scan QR result untuk GIF dan foto berframe di HP.",
  },
];

export default function DocsPage() {
  return (
    <div className="relative min-h-[100dvh] overflow-x-clip bg-bg text-ink">
      <div className="relative">
        <Header />
      </div>

      <main id="top" className="relative space-y-12 overflow-x-clip pb-4 md:space-y-16">
        <section className="mx-auto w-full max-w-5xl px-4 pt-12 md:px-8 md:pt-16">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <Badge variant="neutral">Dokumentasi</Badge>
            <h1 className="text-balance text-4xl font-display font-black uppercase leading-[0.95] tracking-tight md:text-5xl">
              Panduan SnapyOS untuk customer dan owner
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
              Satu halaman untuk dua pembaca. Customer belajar alur foto dari pilih paket sampai
              unduh hasil. Owner belajar setup booth, pembayaran QRIS, dashboard, dan laporan.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button nativeButton={false} render={<Link href="/docs/customer" />}>
                Panduan customer
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button variant="neutral" nativeButton={false} render={<Link href="/docs/owner" />}>
                Panduan owner
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
              <span className="rounded-none border-2 border-ink px-3 py-1">
                Tanpa login untuk customer
              </span>
              <span className="rounded-none border-2 border-ink px-3 py-1">
                Pay first, baru foto
              </span>
              <span className="rounded-none border-2 border-ink px-3 py-1">
                Hasil tersimpan 1-3 hari
              </span>
            </div>
          </div>
        </section>

        <section id="alur" className="mx-auto w-full max-w-5xl scroll-mt-24 px-4 md:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Alur sesi foto
              </p>
              <h2 className="mt-2 text-3xl font-display font-black uppercase tracking-tight sm:text-4xl">
                Lima langkah dari layar ke HP
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
                Ikuti urutan kiosk dari kiri ke kanan. Bayar dulu, timer sesi baru jalan setelah
                status paid.
              </p>
            </div>
            <Link
              href="/docs/mulai"
              className="inline-flex shrink-0 items-center text-sm font-medium underline underline-offset-4 [@media(pointer:coarse)]:min-h-11"
            >
              Ikuti panduan mulai cepat
            </Link>
          </div>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {FLOW.map((s) => (
              <li
                key={s.no}
                className="rounded-none border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111]"
              >
                <span className="font-mono text-xs text-muted-foreground">{s.no}</span>
                <p className="mt-1 text-sm font-semibold">{s.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 md:px-8">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-display font-black uppercase tracking-tight sm:text-4xl">
              Pilih kategori panduan
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
              Pilih kategori di sidebar, ganti mode grid atau list, lalu buka panduannya. Tiap
              kategori juga punya halaman sendiri dengan tombol Berikutnya antar kategori.
            </p>
          </div>

          <div className="mt-8">
            <CategoryBrowser
              groups={DOC_GROUPS.map((g) => ({
                slug: g.slug,
                title: g.title,
                desc: g.desc,
                docs: g.slugs.flatMap((slug) => {
                  const doc = getDocBySlug(slug);
                  return doc ? [{ slug: doc.slug, title: doc.title, summary: doc.summary }] : [];
                }),
              }))}
            />
          </div>

          <div className="mt-10">
            <Link
              href="/docs/perangkat"
              className="group flex flex-col gap-2 rounded-none border-2 border-ink bg-surface p-5 shadow-hard transition-transform hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex flex-col gap-1">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Perangkat
                </span>
                <span className="text-lg font-display font-black uppercase tracking-tight">
                  Kamera, printer, dan token bridge
                </span>
                <span className="max-w-xl text-xs leading-5 text-muted-foreground">
                  Jenis kamera gphoto2, tiga jalur cetak, dan cara generate token bridge untuk
                  Windows dan macOS.
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] group-hover:underline">
                Buka halaman
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </div>

          <div className="mt-14 border-t border-ink pt-10">
            <h3 className="text-2xl font-display font-black uppercase tracking-tight md:text-3xl">
              Daftar isi tiap kategori
            </h3>
            <div className="mt-6 grid gap-x-12 gap-y-8 md:grid-cols-2">
              {DOC_GROUPS.map((g) => (
                <div key={g.slug}>
                  <p className="font-semibold">
                    <Link
                      href={`/docs/${g.slug}`}
                      className="hover:underline [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [@media(pointer:coarse)]:items-center"
                    >
                      {g.title}
                    </Link>
                  </p>
                  <ul className="mt-2 space-y-1.5 text-sm leading-6 [@media(pointer:coarse)]:space-y-0">
                    {g.slugs.map((slug) => {
                      const doc = getDocBySlug(slug);
                      if (!doc) return null;
                      return (
                        <li key={slug}>
                          <Link
                            href={`/docs/${g.slug}#${slug}`}
                            className="font-medium underline underline-offset-4 hover:no-underline [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center"
                          >
                            {doc.title}
                          </Link>
                          <span className="text-muted-foreground">: {doc.summary}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 border-t border-ink pt-8">
            <p className="text-sm font-semibold text-ink">Catatan sumber kebenaran.</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
              Panduan ini disusun dari perilaku kode berjalan SnapyOS. Backend menghitung ulang
              pembayaran. Dana QRIS masuk langsung ke rekening merchant owner. Transaksi tunai
              tercatat untuk laporan tetapi tidak mengkredit saldo. Hasil foto tersimpan 1 sampai 3
              hari mengikuti pengaturan booth.
            </p>
          </div>
        </section>

        <section className="space-y-8">
          <CallToAction />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
