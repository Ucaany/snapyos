import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { ApiError } from "@/lib/api-errors";
import { getPublicConfig } from "@/server/public-config";

type Props = {
  children: ReactNode;
  params: Promise<{ businessSlug: string; photoboxSlug: string }>;
};

/**
 * Gerbang 404 untuk kiosk (AUTH-17).
 *
 * `loading.tsx` di segmen ini membuat Suspense boundary: setelah boundary
 * menyala, Next sudah mengirim status 200 dan `notFound()` di page hanya
 * mengganti body. Layout dirender di luar boundary, jadi status 404 ditetapkan
 * sebelum byte pertama dikirim. `getPublicConfig` memakai unstable_cache,
 * sehingga layout + page berbagi hasil yang sama.
 */
export default async function KioskLayout({ children, params }: Props) {
  const { businessSlug, photoboxSlug } = await params;
  try {
    await getPublicConfig(businessSlug, photoboxSlug);
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === "NOT_FOUND") notFound();
    throw cause;
  }
  return children;
}
