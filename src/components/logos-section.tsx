import { LogoCloud } from "@/components/logo-cloud"; // @efferd/logo-cloud-5
import { SectionHeader } from "@/components/section-header";

export function LogosSection() {
  return (
    <section className="mx-auto h-full max-w-3xl space-y-8 px-4 py-10 md:px-8">
      <SectionHeader
        badge="Pembayaran"
        title="Terima pembayaran dengan mudah"
        subtitle="Kiosk Anda mendukung QRIS via gateway milik Anda: Pakasir, Midtrans, dan Tripay."
      />
      <LogoCloud />
    </section>
  );
}
