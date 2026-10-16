import { HeroSection } from "@/components/hero";
import { Header } from "@/components/header";
import { LogosSection } from "@/components/logos-section";
import { FeatureSection } from "@/components/feature-section";
import { Integrations } from "@/components/integrations";
import { Pricing } from "@/components/pricing";
import { getPublicPlans, getPublicAddOns, getCheapestPlanPrice } from "@/server/catalog";
import { getConsultWhatsApp } from "@/server/consult";
import { waLink } from "@/lib/consult";
import { SectionHeader } from "@/components/section-header";
import CTAWithVerticalMarquee from "@/components/cta-vertical-marquee";
import Faqs01 from "@/components/faq";
import { KioskSimulation } from "@/components/kiosk-simulation";
import { SiteFooter } from "@/components/site-footer";
import { CallToAction } from "@/components/cta-3";

export default async function MarketingPage() {
  const [plans, addOns, cheapestPlan, consultNumber] = await Promise.all([
    getPublicPlans(),
    getPublicAddOns(),
    getCheapestPlanPrice(),
    getConsultWhatsApp(),
  ]);
  return (
    <div className="relative min-h-[100dvh] bg-bg text-ink">
      <div className="relative">
        <Header />
      </div>
      <main className="relative space-y-8 md:space-y-12">
        <HeroSection startingPrice={cheapestPlan} />
        <LogosSection />
        <section className="space-y-8">
          <div className="mx-auto w-full max-w-5xl px-4 md:px-8">
            <SectionHeader
              badge="Fitur"
              title="Semua yang dibutuhkan booth Anda"
              subtitle="Kelola photobox, pembayaran, transaksi, dan laporan dari satu dashboard."
            />
          </div>
          <FeatureSection />
        </section>
        <section id="kiosk" className="space-y-8">
          <div className="mx-auto w-full max-w-4xl px-4 md:px-8">
            <SectionHeader
              badge="Kiosk"
              title="Coba alur photobox"
              subtitle="Pilih paket, bayar, pilih frame, foto, dan lihat hasilnya. Simulasi pengalaman customer di kiosk."
            />
          </div>
          <KioskSimulation />
        </section>
        <Integrations />
        <section id="pricing">
          <Pricing plans={plans} addOns={addOns} />
        </section>
        <CTAWithVerticalMarquee />
        <Faqs01 consultHref={waLink(consultNumber)} />
        <section className="space-y-8">
          <CallToAction />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
