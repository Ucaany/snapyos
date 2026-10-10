import type { Metadata } from "next";
import Link from "next/link";

import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CallToAction } from "@/components/cta-3";
import { ContactForm } from "@/components/contact-form";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Kontak | SnapyOS",
  description: "Hubungi tim SnapyOS.",
};

export default function ContactPage() {
  return (
    <div className="relative min-h-[100dvh] bg-bg text-ink">
      <div className="relative">
        <Header />
      </div>

      <main className="relative space-y-12 pb-4 md:space-y-16">
        <section className="mx-auto w-full max-w-5xl px-4 pt-12 md:px-8 md:pt-16">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <Badge variant="secondary">Kontak</Badge>
            <h1 className="text-balance text-4xl font-medium leading-tight tracking-tight md:text-5xl">
              Bicarakan kebutuhan booth Anda
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
              Kirim detail singkat. Tim SnapyOS menindaklanjuti melalui alamat email
              yang Anda berikan. Untuk panduan mandiri, buka dokumentasi lebih dulu.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button nativeButton={false} render={<Link href="/docs" />}>
                Baca dokumentasi
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button variant="outline" nativeButton={false} render={<a href="mailto:hello@snapyos.id" />}>
                hello@snapyos.id
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
              <span className="rounded-none border-2 border-ink px-3 py-1">Respon via email</span>
              <span className="rounded-none border-2 border-ink px-3 py-1">Tanpa login</span>
              <span className="rounded-none border-2 border-ink px-3 py-1">Gratis bertanya</span>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 md:px-8">
          <div className="grid gap-3 lg:grid-cols-[1.2fr_.8fr]">
            <div className="rounded-none border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111] md:p-8">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Kirim pesan
              </p>
              <h2 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Ceritakan booth Anda</h2>
              <ContactForm />
            </div>
            <div className="flex flex-col gap-3">
              <div className="rounded-none border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Langsung
                </p>
                <h2 className="mt-2 text-xl font-medium tracking-tight md:text-2xl">Email tim</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
                  <a
                    className="font-semibold text-ink underline underline-offset-4"
                    href="mailto:hello@snapyos.id"
                  >
                    hello@snapyos.id
                  </a>
                </p>
              </div>
              <div className="rounded-none border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Mandiri
                </p>
                <h2 className="mt-2 text-xl font-medium tracking-tight md:text-2xl">Panduan dan perangkat</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
                  Alur sesi foto, setup booth, QRIS, dan troubleshooting ada di satu halaman
                  dokumentasi.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="outline" nativeButton={false} render={<Link href="/docs" />}>
                    Dokumentasi
                  </Button>
                </div>
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
