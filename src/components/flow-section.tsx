"use client";

import * as React from "react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { ChartColumnIcon, CloudIcon, PaletteIcon, TicketIcon, WalletIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/section-header";
import { cn } from "@/lib/utils";

type FlowItem = {
  title: string;
  content: string;
  /** Ikon yang mengidentifikasi objeknya langsung: cloud, uang, tiket, palet, grafik. */
  icon: React.ComponentType<{ className?: string }>;
  /** Video loop 16:9 dari `public/video/`. */
  video: string;
};

const items: FlowItem[] = [
  {
    title: "Data aman di cloud",
    content:
      "Semua foto dan transaksi otomatis tersimpan di cloud begitu sesi selesai. Cukup buka dashboard untuk mengakses semuanya: mesin booth rusak, hilang, atau kena reset pun, data kamu tetap aman.",
    icon: CloudIcon,
    video: "/video/snapyos-cloud-web.mp4",
  },
  {
    title: "Uang langsung masuk",
    content:
      "Uang masuk langsung ke rekeningmu tiap tamu foto, tanpa kembalian, tanpa operator pegang cash, tanpa drama setoran. Setiap transaksi tercatat otomatis, jadi angka di laporan selalu cocok sama saldo. Berlaku di paket Growth ke atas.",
    icon: WalletIcon,
    video: "/video/snapyos-qris-web.mp4",
  },
  {
    title: "Voucher untuk jam sepi",
    content:
      "Pakai voucher buat ngisi jam sepi dan naikin nilai tiap transaksi. Bikin promo happy hour, paket bundling, atau diskon khusus per booth, lalu pantau mana yang beneran ngangkat pendapatan lewat data, bukan feeling.",
    icon: TicketIcon,
    video: "/video/snapyos-voucher-web.mp4",
  },
  {
    title: "Brand milik sendiri",
    content:
      "Booth-mu tampil dengan logo, warna, dan gaya brand-mu sendiri, bukan aplikasi pasaran yang sama persis kayak booth sebelah. Atur semua sendiri dari dashboard, cukup beberapa klik.",
    icon: PaletteIcon,
    video: "/video/snapyos-brand-web.mp4",
  },
  {
    title: "Laporan otomatis",
    content:
      "Gross, net, dan profit per periode, plus pengeluaran per kategori, dihitung dari transaksi yang sama dengan yang masuk rekening. Tidak ada rekap manual di akhir bulan.",
    icon: ChartColumnIcon,
    video: "/video/snapyos-laporan-web.mp4",
  },
];

function FlowMedia({ item }: { item: FlowItem }) {
  return (
    <video
      aria-label={item.title}
      autoPlay
      className="size-full object-cover"
      loop
      muted
      playsInline
      preload="metadata"
      src={item.video}
    />
  );
}

function FlowPanel({ item, className }: { item: FlowItem; className?: string }) {
  return (
    <Card className={cn("gap-0 p-6 md:p-8", className)}>
      <div className="aspect-video w-full overflow-hidden border-2 border-ink bg-bg">
        <FlowMedia item={item} />
      </div>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">{item.content}</p>
    </Card>
  );
}

/**
 * Satu panel saja yang boleh ter-mount: tiap panel memuat video, dan dua panel
 * sekaligus mengunduh video yang sama dua kali (7,6 MB untuk item cloud).
 * Nilai awal `false` di server dan klien, jadi render pertama tetap sama;
 * media query baru dibaca di effect setelah hydrate.
 */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return isDesktop;
}

export function FlowSection() {
  const [active, setActive] = React.useState(0);
  const isDesktop = useIsDesktop();
  const current = items[active] ?? items[0];

  if (!current) return null;

  return (
    <MotionConfig reducedMotion="user">
      <section className="space-y-8">
        <div className="mx-auto w-full max-w-5xl px-4 md:px-8">
          <SectionHeader
            badge="Operasional"
            title="Setelah booth jalan"
            subtitle="Data, uang, promo, dan brand tetap di tangan Anda setelah customer pulang."
          />
        </div>

        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-3 px-4 md:px-8 lg:grid-cols-2 lg:items-start lg:gap-8">
          <div>
            <ul className="flex flex-col gap-3">
              {items.map((item, index) => {
                const isActive = active === index;
                const Icon = item.icon;
                return (
                  <li key={item.title}>
                    <button
                      aria-expanded={isActive}
                      className={cn(
                        "flex w-full items-center gap-4 border-2 px-4 py-3 text-left transition-all duration-200",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                        isActive
                          ? "border-ink bg-accent shadow-[2px_2px_0_0_#111111]"
                          : "border-ink/10 bg-surface hover:border-ink"
                      )}
                      onClick={() => setActive(index)}
                      type="button"
                    >
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center border-2 border-ink transition-colors duration-200",
                          isActive ? "bg-ink text-bg" : "bg-bg text-muted-foreground"
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span
                        className={cn(
                          "font-display text-sm uppercase leading-tight tracking-tight transition-colors duration-200",
                          isActive ? "text-ink" : "text-muted-foreground"
                        )}
                      >
                        {item.title}
                      </span>
                    </button>

                    {/* Mobile: panel ikut terbuka di dalam list. Desktop punya panel sticky sendiri. */}
                    <AnimatePresence initial={false}>
                      {isActive && !isDesktop && (
                        <motion.div
                          animate={{ height: "auto", opacity: 1 }}
                          className="overflow-hidden"
                          exit={{ height: 0, opacity: 0 }}
                          initial={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                        >
                          <FlowPanel className="mt-3" item={item} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </div>

          {isDesktop && (
            <div className="lg:sticky lg:top-20">
              <AnimatePresence mode="wait">
                <motion.div
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  id="flow-panel"
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  key={active}
                  transition={{ type: "spring", stiffness: 100, damping: 20 }}
                >
                  <FlowPanel item={current} />
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </div>
      </section>
    </MotionConfig>
  );
}
