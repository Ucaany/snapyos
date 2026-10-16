"use client";

import { ArrowRight, MessageCircle } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/section-header";

const faqs = [
  {
    q: "Apa itu SnapyOS?",
    a: "SnapyOS adalah platform all-in-one untuk menjalankan bisnis photobox (mulai dari kiosk customer, pembayaran QRIS, voucher, template dan branding, hingga laporan pendapatan). Pemilik booth tidak perlu lagi merakit banyak software terpisah.",
  },
  {
    q: "Bagaimana alur customer di booth?",
    a: "Customer tidak perlu login. Alurnya pay-first: pilih paket → pilih metode pembayaran → bayar (QRIS, voucher, atau tunai) → pilih frame/template → sesi foto → edit → hasil otomatis dicetak dan dikirim ke HP lewat QR result.",
  },
  {
    q: "Metode pembayaran apa saja yang didukung?",
    a: "QRIS via gateway merchant Anda sendiri (Pakasir, Midtrans, atau Tripay), voucher, dan tunai. Dana masuk langsung ke rekening Anda sebagai pemilik bisnis (bukan lewat perantara). Kiosk juga mendukung mode offline tunai bila diaktifkan.",
  },
  {
    q: "Bagaimana customer menerima hasil fotonya?",
    a: "Setiap sesi menghasilkan QR result online di URL /r/[token]. Customer scan QR untuk mengunduh GIF dan foto berframe dari HP-nya sendiri, tanpa perlu install aplikasi apa pun.",
  },
  {
    q: "Bagaimana cara menghubungkan booth saya?",
    a: "Setiap photobox punya link unik /p/[namaBisnis]/[namaPhotobox]. Owner menampilkan kode aktivasi sekali pakai dari dashboard, lalu device di-pairing lewat kode atau scan QR. Setelah aktif, device tersambung permanen sampai dicabut.",
  },
  {
    q: "Apakah saya bisa pakai branding sendiri?",
    a: "Bisa. Welcome screen, template, frame, dan halaman result memakai identitas brand Anda (logo, warna, dan copy). Customer melihat pengalaman milik brand Anda, bukan milik SnapyOS.",
  },
  {
    q: "Bagaimana alur pendaftaran sampai booth siap?",
    a: "Daftar akun lewat email → buat bisnis → tambahkan photobox → atur paket dan metode pembayaran → aktifkan device. Setelah itu tim kami menghubungi Anda via WhatsApp untuk memandu setup sampai booth berjalan. Langsung chat kami lewat tombol WhatsApp di bawah halaman ini.",
  },
  {
    q: "Bagaimana jika saya kesulitan memakai SnapyOS?",
    a: "Tentu dibantu. Dukungan tersedia lewat WhatsApp dan email (dari setup awal, pairing device, konfigurasi pembayaran QRIS, sampai troubleshooting di lapangan). Tim kami memandu langkah demi langkah sampai booth Anda lancar.",
  },
  {
    q: "Perangkat apa saja yang kompatibel?",
    a: "Tablet Android/iOS sebagai PWA yang memakai kamera internal. Cukup buka link kiosk di Chrome/Safari lalu pilih Add to Home Screen (tanpa install app native).",
  },
  {
    q: "Bagaimana dengan pembatalan langganan?",
    a: "Langganan bisa dihentikan kapan saja dari dashboard. Akses tetap aktif sampai akhir periode berjalan, tanpa biaya tambahan.",
  },
];

export default function Faqs01({
  defaultValue,
  consultHref,
}: {
  defaultValue?: string;
  /** Link WhatsApp konsultasi (server, dari getConsultWhatsApp), bukan hardcode. */
  consultHref: string;
}) {
  return (
    <section className="relative bg-bg py-8 sm:py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-full [background-image:linear-gradient(to_right,#11111112_1px,transparent_1px),linear-gradient(to_bottom,#11111112_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div className="relative mx-auto max-w-3xl px-6 sm:px-10">
        <SectionHeader
          badge="FAQ"
          title="Pertanyaan yang sering diajukan"
          subtitle="Jawaban singkat untuk pertanyaan yang paling sering kami terima."
        />

        <Accordion
          type="single"
          collapsible
          className="mt-12"
          defaultValue={defaultValue}
        >
          {faqs.map((f, i) => (
            <AccordionItem key={f.q} value={`item-${i}`}>
              <AccordionTrigger>{f.q}</AccordionTrigger>
              <AccordionContent>{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111] sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center border-2 border-ink bg-accent text-ink">
              <MessageCircle className="size-4" />
            </span>
            <div className="flex flex-col leading-tight">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink">
                Masih ada pertanyaan?
              </p>
              <p className="text-xs text-muted-foreground">
                Hubungi kami via WhatsApp pada jam kerja.
              </p>
            </div>
          </div>
          <Button size="sm" nativeButton={false} className="rounded-none border-2 border-ink bg-accent font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink shadow-[4px_4px_0_0_#111111] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#111111] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none" render={<a href={consultHref} target="_blank" rel="noreferrer" />}>
            Chat WhatsApp
            <ArrowRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
