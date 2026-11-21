import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ReceiptView } from "@/components/pos/ReceiptView";
import { buttonVariants } from "@/components/ui/button-variants";
import { ApiError } from "@/lib/api-errors";
import { cn } from "@/lib/utils";
import { getActiveBusiness, requireUser } from "@/lib/tenant";
import { getPosOrder } from "@/server/pos-orders";

export const metadata: Metadata = {
  title: "Struk POS | SnapyOS",
};

/** /pos/receipt/[orderId] — struk siap-cetak (A12: window.print). */
export default async function PosReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const user = await requireUser();
  if (!user) redirect("/login");

  const active = await getActiveBusiness(user.id);
  if (!active) redirect("/dashboard");

  const { orderId } = await params;

  let detail;
  try {
    detail = await getPosOrder(user.id, active.business.id, orderId);
  } catch (error) {
    if (error instanceof ApiError && error.code === "NOT_FOUND") notFound();
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-start justify-center gap-4 p-6">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-destructive">
          {"Gagal memuat struk"}
        </p>
        <p className="max-w-[55ch] text-sm leading-relaxed text-muted-foreground">
          Order tidak dapat dimuat. Kembali ke terminal untuk transaksi baru.
        </p>
        <Link href="/pos" className={cn(buttonVariants({ variant: "neutral" }))}>
          Kembali ke terminal
        </Link>
      </div>
    );
  }
  return <ReceiptView detail={detail} businessName={active.business.name} />;
}
