import type { MetadataRoute } from "next";

const BASE_URL =
  process.env.SnapyOS_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "https://snapyos.site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/admin",
        "/staff",
        "/pos",
        "/api/",
        "/p/",
        "/r/",
        "/onboarding",
        "/welcome",
        "/login",
        "/register",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
