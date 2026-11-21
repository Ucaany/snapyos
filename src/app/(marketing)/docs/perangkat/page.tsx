import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import catalog from "@/data/gphoto2-cameras.json";

export const metadata: Metadata = {
  title: "Perangkat & Kamera | Dokumentasi | SnapyOS",
  description:
    "Jenis kamera gphoto2 yang didukung booth, jalur printer browser/Bluetooth/CUPS, dan cara membuat token bridge lokal untuk Windows dan macOS.",
  alternates: { canonical: "/docs/perangkat" },
};

const CAMERA_TYPES = ["dslr", "mirrorless", "compact", "action", "other"] as const;
const TYPE_LABEL: Record<(typeof CAMERA_TYPES)[number], string> = {
  dslr: "DSLR",
  mirrorless: "Mirrorless",
  compact: "Compact",
  action: "Action",
  other: "Lainnya",
};

const SUPPORT_KEYS = ["full", "capture", "transfer", "unknown"] as const;
const SUPPORT_LABEL: Record<(typeof SUPPORT_KEYS)[number], string> = {
  full: "Siap booth",
  capture: "Capture saja",
  transfer: "Transfer file",
  unknown: "Belum terverifikasi",
};
const SUPPORT_DESC: Record<(typeof SUPPORT_KEYS)[number], string> = {
  full: "Capture/trigger dan liveview siap dipakai booth.",
  capture: "Bisa memicu shutter, tanpa liveview.",
  transfer: "Hanya mengunduh file yang sudah ada di kartu.",
  unknown: "Kemampuan belum terverifikasi dari daftar resmi.",
};
const SUPPORT_CLASS: Record<(typeof SUPPORT_KEYS)[number], string> = {
  full: "bg-accent-3 text-ink",
  capture: "bg-accent-2 text-ink",
  transfer: "bg-surface text-ink",
  unknown: "bg-bg text-muted-foreground",
};

type Camera = (typeof catalog.cameras)[number];

function countByType(cameras: readonly Camera[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const camera of cameras) {
    counts[camera.camera_type] = (counts[camera.camera_type] ?? 0) + 1;
  }
  return counts;
}

function countBySupport(cameras: readonly Camera[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const camera of cameras) {
    counts[camera.booth_support] = (counts[camera.booth_support] ?? 0) + 1;
  }
  return counts;
}

function topBrands(cameras: readonly Camera[], limit: number): { brand: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const camera of cameras) {
    counts.set(camera.brand, (counts.get(camera.brand) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand, "en"))
    .slice(0, limit);
}

const PRINTER_MODES = [
  {
    mode: "browser",
    fits: "Printer foto apa pun yang sudah terpasang di OS",
    bridge: "Tidak",
    note: "Default. Memakai window.print(); di tablet dialog cetak OS selalu muncul, sedangkan silent-print hanya lewat Chrome desktop flag --kiosk-printing.",
  },
  {
    mode: "bluetooth",
    fits: "Printer thermal 58 mm / 80 mm (ESC/POS)",
    bridge: "Tidak",
    note: "Web Bluetooth, fallback Web Serial SPP. Hanya berjalan di browser kiosk; bridge tidak terlibat.",
  },
  {
    mode: "cups",
    fits: "Printer foto kertas gulungan (DNP, Citizen, Selphy)",
    bridge: "Ya",
    note: "Bridge lokal http://127.0.0.1:17777 memakai lpstat/lp/cupsenable; media name mengikuti driver printer.",
  },
] as const;

const BRIDGE_ADAPTERS = [
  {
    adapter: "windows",
    fits: "Windows dengan driver printer terpasang",
    note: "Mendeteksi printer lewat PowerShell Get-Printer, lalu mengirim job ke spooler Windows.",
  },
  {
    adapter: "cups",
    fits: "macOS dan Linux dengan CUPS",
    note: "Mendeteksi printer lewat lpstat, mengirim job lewat lp, dan mengaktifkan antrean lewat cupsenable.",
  },
  {
    adapter: "mock",
    fits: "Pengujian tanpa printer fisik",
    note: "Tidak menyentuh perangkat; dipakai untuk memastikan alur cetak berjalan.",
  },
] as const;

const TOKEN_COMMAND =
  "node -e \"console.log(require('node:crypto').randomBytes(24).toString('base64url'))\"";

const TOKEN_OS = [
  {
    os: "macOS / Linux",
    shell: "zsh atau bash",
    note: "Jalankan di terminal biasa. Node harus tersedia di PATH.",
  },
  {
    os: "Windows PowerShell",
    shell: "PowerShell",
    note: "Perintah yang sama berjalan. Gunakan PowerShell, bukan bash.",
  },
  {
    os: "Windows cmd.exe",
    shell: "Command Prompt",
    note: "Perintah yang sama berjalan tanpa perubahan.",
  },
] as const;

export default function DeviceDocsPage() {
  const cameras = catalog.cameras;
  const typeCounts = countByType(cameras);
  const supportCounts = countBySupport(cameras);
  const brands = topBrands(cameras, 10);
  const total = cameras.length;
  const generatedAt = new Date(catalog.generated_at).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="relative min-h-[100dvh] overflow-x-clip bg-bg text-ink">
      <div className="relative">
        <Header />
      </div>

      <main id="top" className="relative space-y-12 overflow-x-clip pb-4 md:space-y-16">
        <section className="mx-auto w-full max-w-5xl px-4 pt-12 md:px-8 md:pt-16">
          <div className="flex max-w-3xl flex-col items-start gap-5">
            <Badge variant="neutral">Dokumentasi perangkat</Badge>
            <h1 className="text-balance text-4xl font-display font-black uppercase leading-[0.95] tracking-tight md:text-5xl">
              Perangkat dan kamera
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
              Tiga hal yang menentukan booth bisa jalan: kamera yang dikenali gphoto2, jalur printer
              yang cocok dengan kertas, dan token bridge yang sama di service lokal dan di kiosk.
            </p>
            <nav aria-label="Bagian halaman" className="flex flex-wrap gap-2 pt-1">
              {[
                { href: "#kamera", label: "Jenis kamera" },
                { href: "#printer", label: "Jenis printer" },
                { href: "#token", label: "Token bridge" },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded-none border-2 border-ink bg-surface px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] shadow-hard-sm transition-transform hover:-translate-y-0.5"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </section>

        <section
          id="kamera"
          className="mx-auto w-full max-w-5xl scroll-mt-24 px-4 md:px-8"
          aria-labelledby="kamera-heading"
        >
          <div className="flex flex-col gap-3 border-b-2 border-ink pb-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
                {`01 · GPHOTO2 ${catalog.source.gphoto2_version}`}
              </p>
              <h2
                id="kamera-heading"
                className="mt-2 text-3xl font-display font-black uppercase tracking-tight sm:text-4xl"
              >
                Jenis kamera
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
                {`${total.toLocaleString("id-ID")} model dari daftar resmi libgphoto2/gphoto2. Angka di bawah dihitung dari katalog saat build, bukan ditulis manual.`}
              </p>
            </div>
            <Button variant="neutral" nativeButton={false} render={<Link href="/kamera" />}>
              Lihat katalog lengkap
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-none border-2 border-ink bg-surface p-5 shadow-hard">
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                Jumlah per tipe
              </h3>
              <dl className="mt-3 space-y-2">
                {CAMERA_TYPES.map((type) => (
                  <div key={type} className="flex items-baseline justify-between gap-3">
                    <dt className="text-sm">{TYPE_LABEL[type]}</dt>
                    <dd className="font-mono text-sm font-bold tabular-nums">
                      {(typeCounts[type] ?? 0).toLocaleString("id-ID")}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="rounded-none border-2 border-ink bg-surface p-5 shadow-hard">
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                Jumlah per kemampuan booth
              </h3>
              <dl className="mt-3 space-y-2">
                {SUPPORT_KEYS.map((key) => (
                  <div key={key} className="flex items-baseline justify-between gap-3">
                    <dt className="text-sm">{SUPPORT_LABEL[key]}</dt>
                    <dd className="font-mono text-sm font-bold tabular-nums">
                      {(supportCounts[key] ?? 0).toLocaleString("id-ID")}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto border-2 border-ink">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <caption className="sr-only">Arti label kemampuan booth</caption>
              <thead>
                <tr className="border-b-2 border-ink bg-surface">
                  <th scope="col" className="px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Label
                  </th>
                  <th scope="col" className="px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Arti
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Model
                  </th>
                </tr>
              </thead>
              <tbody>
                {SUPPORT_KEYS.map((key) => (
                  <tr key={key} className="border-b border-ink/20 last:border-b-0">
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex border border-ink px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] ${SUPPORT_CLASS[key]}`}
                      >
                        {SUPPORT_LABEL[key]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs leading-5 text-muted-foreground">
                      {SUPPORT_DESC[key]}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                      {(supportCounts[key] ?? 0).toLocaleString("id-ID")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 max-w-3xl text-xs leading-5 text-muted-foreground">
            Label diturunkan dari abilities resmi gphoto2, bukan uji per perangkat. Kamera PTP
            generik bisa tetap bekerja meski tidak tercantum; model berlabel transfer hanya menjamin
            unduh file, bukan capture dari kiosk.
          </p>

          <div className="mt-6 overflow-x-auto border-2 border-ink">
            <table className="w-full min-w-[24rem] border-collapse text-left">
              <caption className="sr-only">Brand dengan model terbanyak</caption>
              <thead>
                <tr className="border-b-2 border-ink bg-surface">
                  <th scope="col" className="px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Brand
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                    Model
                  </th>
                </tr>
              </thead>
              <tbody>
                {brands.map((row) => (
                  <tr key={row.brand} className="border-b border-ink/20 last:border-b-0">
                    <td className="px-3 py-2 font-mono text-xs">{row.brand}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                      {row.count.toLocaleString("id-ID")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {`SNAPSHOT ${generatedAt} · SUMBER ${catalog.source.kind.toUpperCase()} · LISENSI LGPL`}
          </p>
        </section>

        <section
          id="printer"
          className="mx-auto w-full max-w-5xl scroll-mt-24 px-4 md:px-8"
          aria-labelledby="printer-heading"
        >
          <div className="max-w-2xl border-b-2 border-ink pb-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
              02 · JALUR CETAK
            </p>
            <h2
              id="printer-heading"
              className="mt-2 text-3xl font-display font-black uppercase tracking-tight sm:text-4xl"
            >
              Jenis printer
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
              Tidak ada katalog printer. Yang ada tiga jalur cetak di kode, masing-masing dengan
              batasnya sendiri.
            </p>
          </div>

          <div className="mt-6 overflow-x-auto border-2 border-ink">
            <table className="w-full min-w-[44rem] border-collapse text-left">
              <caption className="sr-only">Perbandingan jalur cetak</caption>
              <thead>
                <tr className="border-b-2 border-ink bg-surface">
                  {["Mode", "Cocok untuk", "Butuh bridge?", "Catatan"].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PRINTER_MODES.map((row) => (
                  <tr key={row.mode} className="border-b border-ink/20 last:border-b-0">
                    <th scope="row" className="px-3 py-2 font-mono text-xs font-bold">
                      {row.mode}
                    </th>
                    <td className="px-3 py-2 text-xs leading-5">{row.fits}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.bridge}</td>
                    <td className="px-3 py-2 text-xs leading-5 text-muted-foreground">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {BRIDGE_ADAPTERS.map((row) => (
              <div key={row.adapter} className="rounded-none border-2 border-ink bg-surface p-4">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.08em]">
                  {row.adapter}
                </p>
                <p className="mt-2 text-xs leading-5">{row.fits}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{row.note}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 border-2 border-ink bg-accent p-4 shadow-hard">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
              Batas yang perlu diketahui
            </p>
            <ul className="mt-2 space-y-1.5 text-xs leading-5">
              <li>Browser tidak punya SDK printer; cetak selalu lewat dialog OS atau bridge.</li>
              <li>Bridge hanya bicara ke CUPS atau spooler Windows, tidak pernah ke Bluetooth.</li>
              <li>Printer thermal 58 mm dan 80 mm memakai jalur ESC/POS, bukan CUPS foto.</li>
            </ul>
          </div>
        </section>

        <section
          id="token"
          className="mx-auto w-full max-w-5xl scroll-mt-24 px-4 md:px-8"
          aria-labelledby="token-heading"
        >
          <div className="max-w-2xl border-b-2 border-ink pb-4">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
              03 · KEAMANAN LOKAL
            </p>
            <h2
              id="token-heading"
              className="mt-2 text-3xl font-display font-black uppercase tracking-tight sm:text-4xl"
            >
              Token bridge: cara generate
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
              Bridge menolak start tanpa token minimal 16 karakter. Buat sekali, lalu pakai nilai
              yang sama di service bridge dan di kiosk.
            </p>
          </div>

          <div className="mt-6 border-2 border-ink bg-surface shadow-hard">
            <div className="border-b-2 border-ink px-4 py-2">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                Perintah generate
              </p>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-xs leading-6">
              <code>{TOKEN_COMMAND}</code>
            </pre>
          </div>

          <div className="mt-6 overflow-x-auto border-2 border-ink">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <caption className="sr-only">Perintah token per sistem operasi</caption>
              <thead>
                <tr className="border-b-2 border-ink bg-surface">
                  {["Sistem", "Shell", "Catatan"].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TOKEN_OS.map((row) => (
                  <tr key={row.os} className="border-b border-ink/20 last:border-b-0">
                    <th scope="row" className="px-3 py-2 font-mono text-xs font-bold">
                      {row.os}
                    </th>
                    <td className="px-3 py-2 font-mono text-xs">{row.shell}</td>
                    <td className="px-3 py-2 text-xs leading-5 text-muted-foreground">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Perintah memakai base64url yang tersedia sejak Node 15.7. Repo ini mensyaratkan Node 22
            atau lebih baru, jadi aman di semua mesin kiosk yang didukung.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-none border-2 border-ink bg-surface p-5">
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                Simpan di service bridge
              </h3>
              <p className="mt-2 text-sm leading-6">
                Setel <code className="font-mono text-xs">PHOTOBOOTH_BRIDGE_TOKEN</code> pada
                environment service bridge. Nilai kosong atau kurang dari 16 karakter membuat
                bridge menolak start.
              </p>
            </div>
            <div className="rounded-none border-2 border-ink bg-surface p-5">
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                Simpan di kiosk
              </h3>
              <p className="mt-2 text-sm leading-6">
                Buka Setup Perangkat, isi field “Token bridge”. Nilai disimpan di localStorage
                perangkat ini saja dan tidak pernah masuk database.
              </p>
            </div>
          </div>

          <div className="mt-6 border-2 border-ink bg-surface p-5">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
              Alamat dan header
            </h3>
            <dl className="mt-3 space-y-2 text-sm leading-6">
              <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                <dt className="font-mono text-xs font-bold uppercase tracking-[0.08em]">URL</dt>
                <dd className="font-mono text-xs">http://127.0.0.1:17777</dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                <dt className="font-mono text-xs font-bold uppercase tracking-[0.08em]">Terbuka</dt>
                <dd className="text-xs leading-5">
                  <code className="font-mono">/health</code> tanpa token, dipakai Setup Perangkat
                  untuk deteksi awal.
                </dd>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                <dt className="font-mono text-xs font-bold uppercase tracking-[0.08em]">Rute lain</dt>
                <dd className="text-xs leading-5">
                  Wajib header <code className="font-mono">X-Bridge-Token</code>; token salah
                  dijawab 401.
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-none border-2 border-ink bg-surface p-5">
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">Windows</h3>
              <p className="mt-2 text-sm leading-6">
                Bridge memakai adapter <code className="font-mono text-xs">windows</code> dan
                PowerShell spooler. Tidak ada systemd; jalankan service lewat mekanisme Windows
                yang biasa dipakai.
              </p>
            </div>
            <div className="rounded-none border-2 border-ink bg-surface p-5">
              <h3 className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">macOS</h3>
              <p className="mt-2 text-sm leading-6">
                Pasang gphoto2 lewat Homebrew dan pakai CUPS untuk printer. Tidak ada systemd;
                contoh launchd tidak disediakan.
              </p>
            </div>
          </div>

          <div className="mt-6 border-2 border-ink bg-ink p-4 text-bg">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
              Catatan keamanan
            </p>
            <p className="mt-2 text-xs leading-5">
              Token adalah rahasia perangkat. Jangan commit ke repo, jangan taruh di database, dan
              jangan bagikan lewat chat. Siapa pun yang memegang token bisa memicu shutter dan
              mencetak.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 md:px-8">
          <div className="border-t border-ink pt-8">
            <p className="text-sm font-semibold text-ink">Sumber kebenaran.</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base md:leading-7">
              Angka kamera dihitung dari katalog gphoto2 saat build. Jalur printer dan aturan token
              mengikuti kode berjalan di kiosk dan bridge lokal, bukan asumsi dukungan vendor.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="neutral" nativeButton={false} render={<Link href="/docs" />}>
                Kembali ke dokumentasi
              </Button>
              <Button nativeButton={false} render={<Link href="/kamera" />}>
                Buka katalog kamera
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
