import Link from "next/link";
import { AlertOctagon, ArrowLeft } from "lucide-react";

import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminStatusTabs } from "@/components/admin/AdminStatusTabs";
import { Badge } from "@/components/admin/ui/badge";
import { buttonVariants } from "@/components/admin/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/admin/ui/card";
import { Label } from "@/components/admin/ui/label";
import { Textarea } from "@/components/admin/ui/textarea";
import {
  activateIntentFailureAction,
  dismissIntentFailureAction,
  refundIntentFailureAction,
} from "@/server/admin-actions";
import { listIntentFailures, type IntentFailureStatus } from "@/server/admin";
import { formatIDR } from "@/lib/dashboard-math";

/**
 * Admin - antrian review manual aktivasi subscription (docs/02 §2.4b).
 *
 * Menampilkan kasus di mana `applyInvoiceIntent` di
 * `src/server/subscription.ts` hit early-return non-sukses meski invoice
 * status='paid' - uang settled di provider, plan/add-on tidak aktif.
 * Skenario paling umum: owner cancel → cron transisi cancelled → webhook
 * paid tiba terlambat → uang masuk, subscription mati.
 *
 * Admin punya tiga aksi resolusi:
 *   1. AKTIVASI MANUAL - admin sudah memperbaiki entitlement lewat
 *      /admin/subscriptions atau langsung DB, hanya menutup tiket.
 *   2. REFUND - admin sudah issue refund via dashboard Pakasir,
 *      hanya menutup tiket (invoice tetap paid sebagai fakta historis).
 *   3. DISMISS - false alarm / duplikat / superseded oleh retry yang berhasil.
 *
 * UI mengikuti komponen admin shadcn seperti /admin/subscriptions.
 */

const STATUS_TABS: { key: IntentFailureStatus; label: string }[] = [
  { key: "pending", label: "PENDING" },
  { key: "activated", label: "ACTIVATED" },
  { key: "refunded", label: "REFUNDED" },
  { key: "dismissed", label: "DISMISSED" },
];

const REASON_LABEL: Record<string, string> = {
  SUBSCRIPTION_NOT_ACTIVE:
    "Subscription bukan trial/active/past_due saat webhook paid diterima (owner cancel + cron flip → race)",
  UPDATE_NO_ROW:
    "Race: SELECT lolos tapi UPDATE nol-baris (status berubah di sela SELECT dan UPDATE)",
  MISSING_SUBSCRIPTION_ID:
    "Invoice berisi add-on tapi subscription_id null - mustahil di-attach otomatis",
  INTENT_EXCEPTION:
    "Exception saat aktivasi (klaim sudah dilepas, retry aman) - cek meta.message di audit log",
  LATE_PAYMENT_VOID_INVOICE:
    "Pembayaran masuk untuk invoice yang sudah dibatalkan (void) - perlu review/refund manual",
};

function reasonHelp(reason: string): string {
  return REASON_LABEL[reason] ?? "Alasan kegagalan tidak dikenal - periksa audit_logs";
}

const dateFmt = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

type SearchParams = { status?: string; page?: string };

export default async function AdminSubscriptionPendingReviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const q = await searchParams;
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const activeStatus: IntentFailureStatus =
    STATUS_TABS.find((s) => s.key === q.status)?.key ?? "pending";

  const { items, total, countsByStatus } = await listIntentFailures({
    status: activeStatus,
    page,
    limit: 25,
  });

  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={AlertOctagon}
        title="Antrian Aktivasi Manual"
        description="Invoice sudah lunas (uang settled di provider), tapi aktivasi plan atau add-on gagal karena subscription tidak berada pada status yang valid. Biasanya owner cancel + cron transisi terjadi sebelum webhook paid diterima. Setiap kasus memerlukan keputusan manual: aktivasi (perbaiki via /admin/subscriptions, lalu tutup tiket) atau refund (via dashboard Pakasir)."
        right={
          <Link
            href="/admin/subscriptions"
            aria-label="Kembali ke manajemen langganan"
            title="Kembali ke manajemen langganan"
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Link>
        }
      />

      <AdminStatusTabs
        tabs={STATUS_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          count: countsByStatus[tab.key],
        }))}
        active={activeStatus}
        basePath="/admin/subscriptions/pending-review"
      />

      {/* Empty state */}
      {items.length === 0 ? (
        <AdminEmptyState
          heading={
            activeStatus === "pending"
              ? "Antrian bersih - tidak ada kasus pending"
              : `Tidak ada kasus berstatus ${activeStatus}`
          }
          icon={AlertOctagon}
        >
          {activeStatus === "pending"
            ? "Semua invoice paid berhasil menjalankan aktivasi plan/add-on. Kasus baru tampil di sini setelah halaman dimuat ulang."
            : "Ganti filter tab untuk melihat kasus di status lain."}
        </AdminEmptyState>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((f) => (
            <li key={f.id}>
              <Card>
                <CardHeader className="border-b">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <CardTitle>{f.business_name}</CardTitle>
                      <CardDescription className="text-xs">
                        Invoice {f.invoice_number} · {dateFmt.format(new Date(f.created_at))}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="tabular-nums">
                        {formatIDR(f.amount)}
                      </Badge>
                      <AdminStatusBadge status={f.status} />
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-2">
                    <h3 className="text-xs font-medium text-muted-foreground">Alasan kegagalan</h3>
                    <p className="text-sm font-medium">{f.reason}</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {reasonHelp(f.reason)}
                    </p>
                    {f.message ? (
                      <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs leading-relaxed text-foreground">
                        {f.message}
                      </pre>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      Subscription ID{" "}
                      {f.subscription_id ? (
                        <code className="rounded bg-muted px-1 py-0.5 text-foreground">
                          {f.subscription_id}
                        </code>
                      ) : (
                        <span className="font-medium text-destructive">tidak ada</span>
                      )}
                    </p>
                  </div>

                  <div className="flex min-w-0 flex-col gap-2">
                    <h3 className="text-xs font-medium text-muted-foreground">Intent snapshot</h3>
                    <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed text-foreground">
                      {JSON.stringify(f.intent_snapshot, null, 2)}
                    </pre>
                  </div>
                </CardContent>

                {f.status !== "pending" ? (
                  <CardFooter className="flex-col items-start gap-1">
                    <p className="text-xs text-muted-foreground">
                      Diselesaikan{f.resolved_by_name ? ` oleh ${f.resolved_by_name}` : ""}
                      {f.resolved_at ? ` · ${dateFmt.format(new Date(f.resolved_at))}` : ""}
                    </p>
                    {f.resolution_note ? (
                      <p className="text-sm leading-relaxed text-foreground">{f.resolution_note}</p>
                    ) : null}
                  </CardFooter>
                ) : null}

                {f.status === "pending" ? (
                  <CardFooter className="flex-col items-stretch gap-3">
                    <p className="text-xs font-medium text-muted-foreground">Resolusi</p>
                    <div className="grid gap-3 md:grid-cols-3">
                      <ResolveForm
                        failureId={f.id}
                        action={activateIntentFailureAction}
                        label="Aktivasi manual"
                        variant="default"
                        hint="Setelah mengaktifkan plan/add-on lewat /admin/subscriptions atau langsung DB."
                        confirm="Tutup tiket sebagai AKTIVASI MANUAL? Pastikan plan/add-on sudah benar-benar aktif."
                      />
                      <ResolveForm
                        failureId={f.id}
                        action={refundIntentFailureAction}
                        label="Mark refunded"
                        variant="destructive"
                        hint="Setelah issue refund via dashboard Pakasir (invoice tetap paid)."
                        confirm="Tutup tiket sebagai REFUNDED? Pastikan refund sudah di-issue di Pakasir."
                      />
                      <ResolveForm
                        failureId={f.id}
                        action={dismissIntentFailureAction}
                        label="Dismiss"
                        variant="neutral"
                        hint="False alarm / duplikat / superseded oleh retry yang berhasil."
                        confirm="Tutup tiket sebagai DISMISS?"
                      />
                    </div>
                  </CardFooter>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* Paginator */}
      <AdminPaginator
        basePath="/admin/subscriptions/pending-review"
        page={page}
        totalPages={totalPages}
        searchParams={{ status: activeStatus }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resolution form - hidden failureId + textarea note + labeled submit.
// Kept inline (small, page-specific) - matches the pattern used by
// /admin/subscriptions AdminActionForm children.
// ---------------------------------------------------------------------------

type ResolveVariant = "default" | "neutral" | "destructive";

function ResolveForm({
  failureId,
  action,
  label,
  variant,
  hint,
  confirm,
}: {
  failureId: string;
  action: Parameters<typeof AdminActionForm>[0]["action"];
  label: string;
  variant: ResolveVariant;
  hint: string;
  confirm: string;
}) {
  const noteId = `note-${label.toLowerCase().replace(/\s+/g, "-")}-${failureId}`;
  return (
    <AdminActionForm
      action={action}
      hidden={{ failureId }}
      submitLabel={label}
      variant={variant}
      confirm={confirm}
      className="flex flex-col gap-2"
    >
      <Label htmlFor={noteId} className="text-xs text-muted-foreground">
        Catatan (opsional)
      </Label>
      <Textarea
        id={noteId}
        name="note"
        rows={2}
        maxLength={500}
        placeholder="referensi refund / plan yang di-attach / dsb."
        className="min-h-[3rem] resize-y text-xs"
      />
      <p className="text-xs leading-snug text-muted-foreground">{hint}</p>
    </AdminActionForm>
  );
}
