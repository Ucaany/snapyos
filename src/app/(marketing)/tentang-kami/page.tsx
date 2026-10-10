import type { Metadata } from "next";
import Link from "next/link";

import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CallToAction } from "@/components/cta-3";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Tentang Kami | SnapyOS",
  description: "Mengenal SnapyOS dan tujuan kami membantu bisnis photobox.",
};

const FOKUS = [
  {
    no: "01",
    title: "Alur booth nyata",
    desc: "Customer pilih paket, bayar dulu, pilih frame, foto, unduh hasil. Owner pantau dari dashboard.",
  },
  {
    no: "02",
    title: "Backend sebagai kebenaran",
    desc: "Harga, voucher, dan pembayaran dihitung ulang server. Frontend tidak pernah dipercaya.",
  },
  {
    no: "03",
    title: "Dana ke merchant owner",
    desc: "QRIS masuk langsung ke rekening merchant owner via kredensial Pakasir, Midtrans, atau Tripay.",
  },
];

export default function AboutPage() {
  return (
    <div className="relative min-h-[100dvh] bg-bg text-ink">
      <div className="relative">
        <Header />
      </div>

      <main className="relative space-y-12 pb-4 md:space-y-16">
        <section className="mx-auto w-full max-w-5xl px-4 pt-12 md:px-8 md:pt-16">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <Badge variant="secondary">Tentang Kami</Badge>
            <h1 className="text-balance text-4xl font-display font-black uppercase leading-[0.95] tracking-tight md:text-5xl">
              Operasional photobox, lebih mudah dikelola
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
              SnapyOS membantu pemilik bisnis photobox mengatur booth, pembayaran,
              perangkat, dan laporan dari satu tempat. Dibangun mengikuti alur kerja
              nyata di booth, bukan asumsi.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button nativeButton={false} render={<Link href="/register" />}>
                Mulai dengan SnapyOS
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href="/kontak" />}>
                Hubungi tim
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
              <span className="rounded-none border-2 border-ink px-3 py-1">Pay first, baru foto</span>
              <span className="rounded-none border-2 border-ink px-3 py-1">Dana ke merchant owner</span>
              <span className="rounded-none border-2 border-ink px-3 py-1">Satu dashboard</span>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl scroll-mt-24 px-4 md:px-8">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Fokus kami
          </p>
          <h2 className="mt-2 text-3xl font-display font-black uppercase tracking-tight sm:text-4xl">
            Mengikuti kerja booth, bukan sebaliknya
          </h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FOKUS.map((s) => (
              <li key={s.no} className="rounded-none border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111]">
                <span className="font-mono text-xs text-muted-foreground">{s.no}</span>
                <p className="mt-1 text-sm font-semibold">{s.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 md:px-8">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-none border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111] md:p-8">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Cara kami bekerja
              </p>
              <h3 className="mt-2 text-xl font-display font-black uppercase tracking-tight md:text-2xl">Jelas dan dapat ditelusuri</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
                Setiap transaksi tercatat dari checkout sampai settlement. Voucher
                tervalidasi server, pembayaran QRIS terverifikasi provider, dan hasil
                foto tersimpan 1 sampai 3 hari mengikuti pengaturan booth.
              </p>
            </div>
            <div className="rounded-none border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111] md:p-8">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Kontrol owner
              </p>
              <h3 className="mt-2 text-xl font-display font-black uppercase tracking-tight md:text-2xl">Tetap di tangan pemilik</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
                Owner mengatur paket, frame, voucher, perangkat, dan kredensial
                payment sendiri. Staff operasional memakai shell read-only tanpa
                mengubah konfigurasi bisnis.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button variant="outline" nativeButton={false} render={<Link href="/docs" />}>
                  Baca dokumentasi
                </Button>
                <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
                  Kembali ke beranda
                </Button>
              </div>
            </div>
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
