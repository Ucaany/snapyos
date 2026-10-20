import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SnapyOS Kiosk",
    short_name: "SnapyOS Kiosk",
    description:
      "Kiosk photobox SnapyOS: jalankan booth, ambil foto, terima pembayaran, dan hasilkan GIF dari tablet Android, iPad, atau ponsel.",
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
