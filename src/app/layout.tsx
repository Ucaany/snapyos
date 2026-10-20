import type { Metadata, Viewport } from "next";
import { Archivo_Black, IBM_Plex_Sans, Space_Mono } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  weight: "400",
  subsets: ["latin"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SnapyOS: Sistem Operasional Photobox untuk UMKM",
  description:
    "Buka dan jalankan bisnis photobox Anda: kelola booth, atur pembayaran, pantau pendapatan, dan layani customer dari satu dashboard.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SnapyOS Kiosk",
  },
  applicationName: "SnapyOS Kiosk",
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/snapyos-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/snapyos-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  // Warna accent token (src/styles/tokens.css), bukan warna logo — chrome PWA
  // mengikuti CTA kuning di seluruh UI.
  themeColor: "#ffd400",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="id"
      className={`${archivoBlack.variable} ${plexSans.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
