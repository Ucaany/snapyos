import type { MetadataRoute } from "next";

type Props = { params: Promise<{ businessSlug: string; photoboxSlug: string }> };

/**
 * Manifest khusus booth. Manifest global (`/manifest.webmanifest`) memakai
 * start_url "/" supaya situs marketing tidak terpasang sebagai kiosk. Tablet
 * yang memasang link kiosk butuh start_url dan scope yang menunjuk ke booth
 * itu sendiri, bukan ke beranda.
 */
export async function GET(_request: Request, { params }: Props) {
  const { businessSlug, photoboxSlug } = await params;
  const kioskPath = `/p/${businessSlug}/${photoboxSlug}`;

  const manifest: MetadataRoute.Manifest = {
    name: "SnapyOS Kiosk",
    short_name: "Kiosk",
    description: "Kiosk photobox SnapyOS: pilih paket, bayar, ambil foto, dan unduh hasil.",
    id: kioskPath,
    start_url: kioskPath,
    scope: `${kioskPath}/`,
    display: "standalone",
    display_override: ["standalone", "fullscreen"],
    orientation: "any",
    background_color: "#fffdf5",
    theme_color: "#ffd400",
    icons: [
      { src: "/snapyos-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/snapyos-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/snapyos-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };

  return Response.json(manifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
