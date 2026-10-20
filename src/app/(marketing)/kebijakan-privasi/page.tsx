import type { Metadata } from "next";
import { MarketingCard, MarketingLinks, MarketingPage } from "@/components/marketing-page";
export const metadata: Metadata = {
  title: "Kebijakan Privasi | SnapyOS",
  description: "Kebijakan privasi SnapyOS.",
};
export default function PrivacyPage() {
  return (
    <MarketingPage
      eyebrow="Kebijakan Privasi"
      title="Data Anda dipakai untuk menjalankan layanan."
      description="Ringkasan data yang diproses SnapyOS, tujuan penggunaannya, dan pilihan yang tersedia bagi Anda."
      updated="10 Oktober 2026"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <MarketingCard title="Data yang diproses">
          <p>
            Data akun, informasi bisnis, konfigurasi booth, transaksi, serta data teknis yang
            diperlukan untuk autentikasi, operasional, dukungan, dan keamanan.
          </p>
        </MarketingCard>
        <MarketingCard title="Penggunaan data">
          <p>
            Data digunakan untuk menyediakan fitur, memproses pembayaran melalui penyedia terkait,
            mencegah penyalahgunaan, dan membantu menyelesaikan kendala.
          </p>
        </MarketingCard>
        <MarketingCard title="Kontrol Anda">
          <p>
            Anda dapat meminta informasi, koreksi, atau penghapusan data melalui kanal kontak,
            sepanjang tidak bertentangan dengan kewajiban pencatatan transaksi.
          </p>
        </MarketingCard>
        <MarketingCard title="Pertanyaan privasi">
          <p>
            Hubungi{" "}
            <a
              className="font-semibold text-primary underline [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:items-center"
              href="mailto:hello@snapyos.id"
            >
              hello@snapyos.id
            </a>{" "}
            untuk pertanyaan tentang data pribadi.
          </p>
        </MarketingCard>
      </div>
      <div className="mt-8">
        <MarketingLinks />
      </div>
    </MarketingPage>
  );
}
