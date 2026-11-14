import { Send } from "lucide-react";

import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminDisclosureCard } from "@/components/admin/AdminDisclosureCard";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminStatusBadge } from "@/components/admin/AdminStatusBadge";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/admin/ui/card";
import { Input } from "@/components/admin/ui/input";
import { Textarea } from "@/components/admin/ui/textarea";
import {
  createBroadcastAction,
  sendBroadcastAction,
  resendBroadcastAction,
} from "@/server/admin-actions";
import { listBroadcasts, getBroadcastStats, listBroadcastRecipients } from "@/server/admin";
import { BROADCAST_KIND_LABEL } from "@/lib/broadcast-email";
import { Label } from "@/components/admin/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/admin/ui/table";

/**
 * Admin Broadcast Email - marketing/pengumuman via Resend (migration 0057/0058).
 * Full-control admin: pilih jenis (announcement/promo/newsletter/event/system),
 * pilih template, kirim ke audiens, kirim ulang dengan limit, dan lihat riwayat
 * pengiriman per penerima (detail & jelas).
 */

const KIND_OPTIONS = [
  { value: "announcement", label: "Pengumuman" },
  { value: "promo", label: "Promo / Diskon" },
  { value: "newsletter", label: "Newsletter" },
  { value: "event", label: "Event / Acara" },
  { value: "system", label: "Sistem / Teknis" },
] as const;

const TEMPLATE_OPTIONS = [
  { value: "default", label: "Default (otomatis)" },
  { value: "announcement", label: "Pengumuman" },
  { value: "promo", label: "Promo" },
  { value: "newsletter", label: "Newsletter" },
  { value: "event", label: "Event" },
  { value: "system", label: "Sistem" },
] as const;

const AUDIENCE_OPTIONS = [
  { value: "all", label: "Semua (users + owners)" },
  { value: "users", label: "Semua users" },
  { value: "owners", label: "Owner bisnis" },
] as const;

export default async function AdminBroadcastsPage() {
  const broadcasts = await listBroadcasts();
  const stats = await getBroadcastStats(broadcasts.map((b) => b.id));
  const statsByCampaign = new Map(stats.map((s) => [s.campaign_id, s]));

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        eyebrow="Admin / Broadcast Email"
        icon={Send}
        title="Broadcast Email"
        meta="Pengumuman · marketing · resend dengan limit · riwayat pengiriman"
      />

      <Card>
        <CardHeader>
          <CardTitle>Buat Broadcast Baru</CardTitle>
          <CardDescription>
            Pilih jenis &amp; template, kirim ke audiens terpilih. Delivery via Resend.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminActionForm
            action={createBroadcastAction}
            submitLabel="Simpan Draft"
            pendingLabel="Menyimpan…"
            submitClassName="min-h-11"
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <AdminSelect
              name="kind"
              label="Jenis Broadcast"
              defaultValue="announcement"
              options={KIND_OPTIONS}
            />
            <AdminSelect
              name="template_key"
              label="Template"
              defaultValue="default"
              options={TEMPLATE_OPTIONS}
            />
            <div className="flex flex-col gap-1 md:col-span-2">
              <Label htmlFor="bc-subject" className="text-xs font-medium text-muted-foreground">
                Subjek
              </Label>
              <Input
                id="bc-subject"
                name="subject"
                placeholder="Pengumuman platform / promo"
                required
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <Label htmlFor="bc-body" className="text-xs font-medium text-muted-foreground">
                Isi pesan
              </Label>
              <Textarea
                id="bc-body"
                name="body"
                rows={6}
                placeholder={"Baris ganda = paragraf baru"}
                className="text-sm"
                required
              />
            </div>
            <AdminSelect
              name="audience"
              label="Audiens"
              defaultValue="all"
              options={AUDIENCE_OPTIONS}
            />
            <div className="flex flex-col gap-1">
              <Label htmlFor="bc-max-resend" className="text-xs font-medium text-muted-foreground">
                Limit resend (0–10)
              </Label>
              <Input
                id="bc-max-resend"
                name="max_resend"
                type="number"
                min={0}
                max={10}
                defaultValue={3}
              />
            </div>
          </AdminActionForm>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {broadcasts.length === 0 ? (
          <AdminEmptyState heading="Belum ada broadcast" icon={Send}>
            Buat draft pertama di atas, lalu kirim ke audiens terpilih.
          </AdminEmptyState>
        ) : (
          broadcasts.map((b) => {
            const s = statsByCampaign.get(b.id);
            const sentText = s ? `${s.sent}/${s.total} terkirim` : "belum dikirim";
            const resendLeft = b.max_resend - b.resend_count;
            const isTerminal = b.status === "partial" || b.status === "failed";
            const canSend = b.status === "draft" || b.status === "sending";
            const canResend = isTerminal && resendLeft > 0;
            const resendExhausted = isTerminal && resendLeft <= 0;
            return (
              <AdminDisclosureCard
                key={b.id}
                trigger={
                  <>
                    <span className="text-base font-medium tracking-tight">{b.subject}</span>
                    <span className="rounded-md border bg-muted px-2 py-0.5 text-xs">
                      {BROADCAST_KIND_LABEL[b.kind] ?? b.kind}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      AUDIENS {b.audience.toUpperCase()} · TEMPLATE {b.template_key}
                    </span>
                    <AdminStatusBadge status={b.status} />
                  </>
                }
              >
                <div className="flex flex-col gap-4">
                  <pre className="whitespace-pre-wrap rounded-md border bg-background p-3 text-xs leading-relaxed">
                    {b.body}
                  </pre>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {sentText} · RESEND {b.resend_count}/{b.max_resend}
                    {s && s.failed > 0 ? ` · GAGAL ${s.failed}` : ""}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4">
                    {canSend && (
                      <AdminActionForm
                        action={sendBroadcastAction}
                        hidden={{ campaignId: b.id }}
                        submitLabel="Kirim Sekarang"
                        pendingLabel="Mengirim…"
                        submitClassName="min-h-11"
                      />
                    )}
                    {canResend && (
                      <AdminActionForm
                        action={resendBroadcastAction}
                        hidden={{ campaignId: b.id }}
                        submitLabel={`Kirim Ulang Gagal (${resendLeft} tersisa)`}
                        pendingLabel="Mengirim ulang…"
                        variant="neutral"
                        submitClassName="min-h-11"
                      />
                    )}
                    {resendExhausted && (
                      <p className="text-xs text-muted-foreground">
                        Batas resend tercapai ({b.resend_count}/{b.max_resend})
                      </p>
                    )}
                  </div>

                  <RecipientHistory campaignId={b.id} />
                </div>
              </AdminDisclosureCard>
            );
          })
        )}
      </div>
    </div>
  );
}

async function RecipientHistory({ campaignId }: { campaignId: string }) {
  const recipients = await listBroadcastRecipients(campaignId);
  if (recipients.length === 0) {
    return (
      <p className="mt-4 text-xs text-muted-foreground">
        Belum ada penerima. Kirim broadcast untuk melihat riwayat pengiriman.
      </p>
    );
  }
  const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs text-muted-foreground">
        Riwayat Pengiriman ({recipients.length})
      </p>
      <div className="max-h-96 overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Penerima</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Resend</TableHead>
              <TableHead className="hidden md:table-cell">Terakhir</TableHead>
              <TableHead>ID / Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipients.map((r) => (
              <TableRow key={r.id} className="align-top">
                <TableCell>
                  <span className="font-semibold">{r.name ?? r.email}</span>
                  <br />
                  <span className="text-xs text-muted-foreground">{r.email}</span>
                </TableCell>
                <TableCell>{r.kind}</TableCell>
                <TableCell>
                  <AdminStatusBadge status={r.status} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">{r.resend_count}x</TableCell>
                <TableCell className="hidden text-xs md:table-cell">
                  {r.last_sent_at ? dateFmt.format(new Date(r.last_sent_at)) : "-"}
                </TableCell>
                <TableCell className="break-all text-xs">
                  {r.provider_message_id ? (
                    <span className="text-muted-foreground">{r.provider_message_id}</span>
                  ) : (
                    <span className="text-destructive">{r.error ?? r.last_error ?? "-"}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
