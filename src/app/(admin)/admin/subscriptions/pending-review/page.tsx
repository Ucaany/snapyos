import Link from "next/link";
import { AlertOctagon, ArrowLeft } from "lucide-react";

import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { PageHeader } from "@/components/ui/page-header";
import { buttonVariants } from "@/components/ui/button-variants";
import { AdminPaginator } from "@/components/admin/AdminPaginator";
import { cn } from "@/lib/utils";
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
 * UI mengikuti Neo-Brutalist token seperti /admin/subscriptions.
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
    <div className="flex flex-col gap-6 p-6 md:gap-8 md:p-10">
      {/* Header - micro-typography + massive header per docs/11 §11.1 */}
      <PageHeader
        eyebrow="ADMIN - SUBSCRIPTIONS / PENDING REVIEW"
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

      {/* Tabs status + counts */}
      <nav
        aria-label="Filter status kasus"
        className="flex flex-wrap gap-2 border-b-2 border-ink pb-3"
      >
        {STATUS_TABS.map((tab) => {
          const active = tab.key === activeStatus;
          const count = countsByStatus[tab.key];
          return (
            <Link
              key={tab.key}
              href={`/admin/subscriptions/pending-review?status=${tab.key}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                buttonVariants({ variant: active ? "default" : "outline", size: "sm" }),
                "gap-2 font-mono uppercase tracking-[0.1em]"
              )}
            >
              <span>{tab.label}</span>
              <span
                className={
                  active
                    ? "border-2 border-ink bg-bg px-1.5 py-0.5 text-[11px] tabular-nums"
                    : "border-2 border-ink/40 bg-muted/60 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground"
                }
              >
                {String(count).padStart(2, "0")}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Empty state */}
      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 border-2 border-dashed border-ink/40 bg-muted p-8">
          <p className="font-mono text-sm font-bold uppercase tracking-[0.15em]">
            {activeStatus === "pending"
              ? "ANTRIAN BERSIH - TIDAK ADA KASUS PENDING"
              : `TIDAK ADA KASUS BERSTATUS ${activeStatus.toUpperCase()}`}
          </p>
          <p className="max-w-[55ch] text-sm leading-relaxed text-muted-foreground">
            {activeStatus === "pending"
              ? "Semua invoice paid berhasil menjalankan aktivasi plan/add-on. Bila muncul kasus baru, akan tampil di sini secara real-time (page refresh)."
              : "Ganti filter tab untuk melihat kasus di status lain."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((f) => (
            <li key={f.id} className="border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
              {/* Header baris */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink/10 p-4">
                <div className="flex flex-col gap-1">
                  <span className="font-display text-lg uppercase tracking-tight">
                    {f.business_name}
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    INVOICE {f.invoice_number} · {dateFmt.format(new Date(f.created_at))}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="border-2 border-ink bg-accent-2 px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-ink">
                    {formatIDR(f.amount)}
                  </span>
                  <StatusBadge status={f.status} />
                </div>
              </div>

              {/* Body - reason + intent snapshot */}
              <div className="grid grid-cols-[minmax(0,1fr)] gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    [ REASON ]
                  </p>
                  <p className="w-fit border-2 border-ink bg-accent-2 px-2 py-1 font-mono text-sm font-bold uppercase tracking-[0.05em] text-ink">
                    {f.reason}
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {reasonHelp(f.reason)}
                  </p>
                  {f.message ? (
                    <pre className="mt-1 overflow-x-auto border-2 border-ink/20 bg-muted p-2 font-mono text-[11px] leading-relaxed text-ink">
                      {f.message}
                    </pre>
                  ) : null}
                  {f.subscription_id ? (
                    <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                      SUBSCRIPTION_ID{" "}
                      <code className="bg-muted px-1 py-0.5 text-ink">{f.subscription_id}</code>
                    </p>
                  ) : (
                    <p className="mt-2 inline-block w-fit border-2 border-ink bg-accent-2 px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink">
                      SUBSCRIPTION_ID {"<NULL>"}
                    </p>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-2">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    [ INTENT SNAPSHOT ]
                  </p>
                  <pre className="max-h-64 overflow-auto border-2 border-ink/20 bg-muted p-3 font-mono text-[11px] leading-relaxed text-ink">
                    {JSON.stringify(f.intent_snapshot, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Resolution meta (kalau bukan pending) */}
              {f.status !== "pending" ? (
                <div className="flex flex-col gap-1 border-t-2 border-ink/10 bg-muted/50 p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                    RESOLVED{f.resolved_by_name ? ` BY ${f.resolved_by_name}` : ""}
                    {f.resolved_at ? ` · ${dateFmt.format(new Date(f.resolved_at))}` : ""}
                  </p>
                  {f.resolution_note ? (
                    <p className="text-sm leading-relaxed text-ink">{f.resolution_note}</p>
                  ) : null}
                </div>
              ) : null}

              {/* Aksi resolusi - hanya untuk kasus pending */}
              {f.status === "pending" ? (
                <div className="flex flex-col gap-3 border-t-2 border-ink/10 bg-muted/40 p-4">
                  <p className="font-mono text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    [ RESOLUSI ]
                  </p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <ResolveForm
                      failureId={f.id}
                      action={activateIntentFailureAction}
                      label="AKTIVASI MANUAL"
                      variant="default"
                      hint="Setelah mengaktifkan plan/add-on lewat /admin/subscriptions atau langsung DB."
                      confirm="Tutup tiket sebagai AKTIVASI MANUAL? Pastikan plan/add-on sudah benar-benar aktif."
                    />
                    <ResolveForm
                      failureId={f.id}
                      action={refundIntentFailureAction}
                      label="MARK REFUNDED"
                      variant="destructive"
                      hint="Setelah issue refund via dashboard Pakasir (invoice tetap paid)."
                      confirm="Tutup tiket sebagai REFUNDED? Pastikan refund sudah di-issue di Pakasir."
                    />
                    <ResolveForm
                      failureId={f.id}
                      action={dismissIntentFailureAction}
                      label="DISMISS"
                      variant="outline"
                      hint="False alarm / duplikat / superseded oleh retry yang berhasil."
                      confirm="Tutup tiket sebagai DISMISS?"
                    />
                  </div>
                </div>
              ) : null}
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

type ResolveVariant = "default" | "outline" | "destructive";

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
      className="flex flex-col gap-2 border-2 border-ink/20 bg-surface p-3"
    >
      <label
        htmlFor={noteId}
        className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink"
      >
        Catatan (opsional)
      </label>
      <textarea
        id={noteId}
        name="note"
        rows={2}
        maxLength={500}
        placeholder="referensi refund / plan yang di-attach / dsb."
        className="min-h-[3rem] w-full resize-y border-2 border-ink bg-bg px-2 py-1.5 font-mono text-xs text-ink outline-none focus:bg-accent/20"
      />
      <p className="font-mono text-[11px] leading-snug text-muted-foreground">{hint}</p>
    </AdminActionForm>
  );
}
