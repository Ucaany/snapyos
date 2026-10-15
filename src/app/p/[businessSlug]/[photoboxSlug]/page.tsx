import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KioskApp } from "@/components/kiosk/KioskApp";
import { KioskErrorBoundary } from "@/components/kiosk/KioskErrorBoundary";
import { ApiError } from "@/lib/api-errors";
import { getPublicConfig } from "@/server/public-config";

export const metadata: Metadata = {
  title: "Photobox · SnapyOS",
};

type Props = {
  params: Promise<{ businessSlug: string; photoboxSlug: string }>;
  searchParams: Promise<{ code?: string }>;
};

/** GET /p/[businessSlug]/[photoboxSlug] — kiosk customer app (docs/05 §5.0–5.1). */
export default async function KioskPage({ params, searchParams }: Props) {
  const { businessSlug, photoboxSlug } = await params;
  const { code } = await searchParams;

  // Hanya NOT_FOUND yang jadi 404. Gangguan sesaat (Supabase down, timeout,
  // 5xx) dilempar ke error boundary agar booth bisa "Muat Ulang" — bukan
  // menampilkan 404 "tidak ditemukan" untuk booth yang sebenarnya ada, yang
  // membuat petugas mencari kesalahan di tempat yang salah.
  let config;
  try {
    config = await getPublicConfig(businessSlug, photoboxSlug);
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === "NOT_FOUND") notFound();
    throw cause;
  }

  return (
    <KioskErrorBoundary>
      <KioskApp
        config={config}
        businessSlug={businessSlug}
        initialCode={code ?? null}
        devSkipPayment={process.env.DEV_SKIP_PAYMENT === "true"}
        offlineEnabled={config.checkout.offline_enabled}
      />
    </KioskErrorBoundary>
  );
}
