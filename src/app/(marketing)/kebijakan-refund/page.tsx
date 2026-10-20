import type { Metadata } from "next";
import { MarketingCard, MarketingLinks, MarketingPage } from "@/components/marketing-page";
export const metadata: Metadata = {
  title: "Kebijakan Pengembalian Dana | SnapyOS",
  description: "Kebijakan pengembalian dana SnapyOS.",
};
export default function RefundPage() {
  return (
    <MarketingPage
      eyebrow="Kebijakan Pengembalian Dana"
      title="Pengembalian dana mengikuti status transaksi."
      description="Kebijakan ini menjelaskan cara pengajuan dan pemeriksaan pengembalian dana untuk layanan SnapyOS."
      updated="10 Oktober 2026"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <MarketingCard title="Pengajuan">
          <p>
            Ajukan pengembalian dana melalui kanal kontak dengan menyertakan email akun, referensi
            transaksi, tanggal pembayaran, dan alasan pengajuan.
          </p>
        </MarketingCard>
        <MarketingCard title="Pemeriksaan">
          <p>
            Pengajuan diperiksa berdasarkan status transaksi, bukti pembayaran, serta layanan yang
            sudah digunakan. Persetujuan tidak otomatis.
          </p>
        </MarketingCard>
        <MarketingCard title="Waktu proses">
          <p>
            Setelah keputusan dibuat, proses pengembalian mengikuti metode pembayaran dan ketentuan
            penyedia pembayaran terkait.
          </p>
        </MarketingCard>
        <MarketingCard title="Pengecualian">
          <p>
            Pengajuan untuk transaksi yang sudah digunakan atau tidak dapat diverifikasi dapat
            ditolak. Detail keputusan disampaikan melalui kanal kontak.
          </p>
        </MarketingCard>
      </div>
      <div className="mt-8">
        <MarketingLinks />
      </div>
    </MarketingPage>
  );
}
