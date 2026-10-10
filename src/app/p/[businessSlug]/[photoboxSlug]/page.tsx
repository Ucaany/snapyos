import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KioskApp } from "@/components/kiosk/KioskApp";
import { KioskErrorBoundary } from "@/components/kiosk/KioskErrorBoundary";
import { getPublicConfig } from "@/server/public-config";

export const metadata: Metadata = {
  title: "Photobox — SnapyOS",
};

type Props = {
  params: Promise<{ businessSlug: string; photoboxSlug: string }>;
  searchParams: Promise<{ code?: string }>;
};

/** GET /p/[businessSlug]/[photoboxSlug] — kiosk customer app (docs/05 §5.1). */
export default async function KioskPage({ params, searchParams }: Props) {
  const { businessSlug, photoboxSlug } = await params;
  const { code } = await searchParams;

  let config = null;
  try {
    config = await getPublicConfig(businessSlug, photoboxSlug);
  } catch {
    config = null;
  }
  if (!config) notFound();

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
