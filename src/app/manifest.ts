import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SnapyOS — Photobox Kiosk",
    short_name: "SnapyOS Kiosk",
    description:
      "Kiosk photobox SnapyOS — jalankan booth, capture foto, terima pembayaran QRIS, dan hasilkan GIF dari iPad, tablet Android, atau ponsel.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "fullscreen"],
    orientation: "any",
    background_color: "#fffdf5",
    theme_color: "#ffd400",
    categories: ["business", "photo", "productivity"],
    shortcuts: [
      {
        name: "Mulai Kiosk",
        short_name: "Kiosk",
        url: "/",
      },
    ],
    icons: [
      {
        src: "/snapyos-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/snapyos-icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/snapyos-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
