import type { MetadataRoute } from "next";

const BASE_URL =
  process.env.SnapyOS_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "https://snapyos.biz.id";

const MARKETING_PATHS = [
  "",
  "/tentang-kami",
  "/kontak",
  "/subscribe",
  "/docs",
  "/docs/perangkat",
  "/kamera",
  "/ketentuan-layanan",
  "/kebijakan-privasi",
  "/kebijakan-refund",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return MARKETING_PATHS.map((path) => ({
    url: `${BASE_URL}${path}`,
    lastModified,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.6,
  }));
}
