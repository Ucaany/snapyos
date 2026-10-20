import type { Metadata } from "next";
import { MarketingCard, MarketingLinks, MarketingPage } from "@/components/marketing-page";
export const metadata: Metadata = {
  title: "Ketentuan Layanan | SnapyOS",
  description: "Ketentuan penggunaan SnapyOS.",
};
export default function TermsPage() {
  return (
    <MarketingPage
      eyebrow="Ketentuan Layanan"
      title="Gunakan SnapyOS dengan bertanggung jawab."
      description="Ketentuan dasar penggunaan akun, workspace, pembayaran, dan perangkat lunak SnapyOS."
      updated="10 Oktober 2026"
    >
      <div className="space-y-5">
        <MarketingCard title="Akun dan akses">
          <p>
            Anda bertanggung jawab menjaga kredensial akun dan memastikan data bisnis yang
            dimasukkan akurat. Jangan membagikan akses kepada pihak yang tidak berwenang.
          </p>
        </MarketingCard>
        <MarketingCard title="Penggunaan layanan">
          <p>
            Gunakan SnapyOS untuk operasional bisnis yang sah. Dilarang menyalahgunakan layanan,
            mengganggu sistem, atau mencoba mengakses data bisnis lain.
          </p>
        </MarketingCard>
        <MarketingCard title="Pembayaran dan perubahan">
          <p>
            Harga, pajak, metode pembayaran, dan fitur mengikuti informasi yang ditampilkan saat
            transaksi. Perubahan layanan akan disampaikan melalui kanal resmi.
          </p>
        </MarketingCard>
      </div>
      <div className="mt-8">
        <MarketingLinks />
      </div>
    </MarketingPage>
  );
}
