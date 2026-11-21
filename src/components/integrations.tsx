import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type LogoType = {
  src: string;
  alt: string;
};

type TileData = {
  row: number;
  col: number;
  logo?: LogoType;
};

export function Integrations() {
  return (
    <div className="relative mx-auto grid max-w-4xl grid-cols-1 gap-12 px-4 md:grid-cols-2 md:items-center md:px-8">
      {/* Left Content */}
      <div className="p-4 md:p-6">
        <div className="space-y-4">
          <div className="flex flex-col items-start gap-4">
            <Badge variant="neutral" className="w-fit">
              Gateway Pembayaran
            </Badge>
            <h2 className="font-display text-3xl font-black uppercase leading-[0.95] tracking-tight text-foreground sm:text-4xl">
              Hubungkan gateway Anda sendiri
            </h2>
            <p className="text-sm text-muted-foreground md:text-base">
              Pakai kredensial Pakasir, Midtrans, atau Tripay milik Anda. Uang kiosk masuk langsung
              ke rekening bisnis Anda, bukan lewat rekening SnapyOS. Tersedia di paket Growth ke
              atas.
            </p>
          </div>
          <Button size="sm" nativeButton={false} render={<Link href="/docs/pembayaran" />}>
            Lihat Cara Bayar
          </Button>
        </div>
      </div>

      {/* Right Content - Visual */}
      <div className="place-items-end">
        <div className="relative size-80">
          {/* Grid Background */}
          <div
            className={cn(
              "absolute inset-0 size-full",
              "bg-[linear-gradient(to_right,theme(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,theme(--color-border)_1px,transparent_1px)]",
              "bg-size-[64px_64px]",
              "mask-[radial-gradient(ellipse_at_center,black,black,transparent)]"
            )}
          />

          {tiles.map((tile) => (
            <IntegrationCard key={`${tile.row}_${tile.col}`} {...tile} />
          ))}
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({ row, col, logo }: TileData) {
  return (
    <div
      className={cn(
        "absolute flex size-16 items-center justify-center",
        logo ? "bg-secondary/40" : "" // Styling for empty tiles
      )}
      style={{
        left: col * 64, // 64px cell
        top: row * 64,
      }}
    >
      {logo && (
        <img
          alt={logo.alt}
          className="pointer-events-none h-5 w-fit select-none object-contain"
          src={logo.src}
        />
      )}
    </div>
  );
}

// Gateways yang didukung kiosk SnapyOS (docs/06-checkout-payment.md).
const tiles: TileData[] = [
  // Row 0
  { row: 0, col: 1, logo: { src: "/payment-logos/pakasir.png", alt: "Pakasir" } },
  { row: 0, col: 3, logo: { src: "/payment-logos/midtrans.svg", alt: "Midtrans" } },

  // Row 1
  { row: 1, col: 0 },
  { row: 1, col: 2, logo: { src: "/payment-logos/tripay.png", alt: "Tripay" } },
  { row: 1, col: 4 },

  // Row 2
  { row: 2, col: 1 },
  { row: 2, col: 3, logo: { src: "/payment-logos/pakasir.png", alt: "Pakasir" } },

  // Row 3
  { row: 3, col: 0 },
  { row: 3, col: 2, logo: { src: "/payment-logos/midtrans.svg", alt: "Midtrans" } },
  { row: 3, col: 4 },

  // Row 4
  { row: 4, col: 1, logo: { src: "/payment-logos/tripay.png", alt: "Tripay" } },
  { row: 4, col: 3 },
];
