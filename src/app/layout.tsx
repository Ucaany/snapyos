import type { Metadata, Viewport } from "next";
import {
  Archivo_Black,
  IBM_Plex_Sans,
  Manrope,
  Plus_Jakarta_Sans,
  Space_Mono,
} from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/PwaRegister";

const archivoBlack = Archivo_Black({
  variable: "--font-archivo-black",
  weight: "400",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
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
  title: "SnapyOS — Photobox Business OS untuk UMKM",
  description:
    "Buka dan jalankan bisnis photobox Anda: kelola booth, terima pembayaran QRIS pay-first, pantau pendapatan, dan layani customer dari satu dashboard.",
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
      { url: "/snapyos-icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#ffd400",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="id"
      className={`${archivoBlack.variable} ${plexSans.variable} ${spaceMono.variable} ${manrope.variable} ${jakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning><PwaRegister />{children}</body>
    </html>
  );
}
