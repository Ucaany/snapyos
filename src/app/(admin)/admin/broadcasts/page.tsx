import { AdminActionForm } from "@/components/admin/AdminActionForm";
import { AdminEmptyState } from "@/components/admin/AdminEmptyState";
import { BrutalistSelect } from "@/components/admin/BrutalistSelect";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createBroadcastAction, sendBroadcastAction, resendBroadcastAction } from "@/server/admin-actions";
import { listBroadcasts, getBroadcastStats, listBroadcastRecipients } from "@/server/admin";
import { BROADCAST_KIND_LABEL } from "@/lib/broadcast-email";

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

function statusFor(status: string): string {
  return status;
}

export default async function AdminBroadcastsPage() {
  const broadcasts = await listBroadcasts();
  const stats = await getBroadcastStats(broadcasts.map((b) => b.id));
  const statsByCampaign = new Map(stats.map((s) => [s.campaign_id, s]));

  return (
    <div className="flex flex-col gap-8 p-6 md:p-10">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          {"/// ADMIN - BROADCAST EMAIL"}
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-tight md:text-4xl">
          Broadcast Email
        </h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          PENGUMUMAN · MARKETING · RESEND DENGAN LIMIT · RIWAYAT PENGIRIMAN
        </p>
      </header>

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
            <BrutalistSelect name="kind" label="Jenis Broadcast" defaultValue="announcement" options={KIND_OPTIONS} />
            <BrutalistSelect name="template_key" label="Template" defaultValue="default" options={TEMPLATE_OPTIONS} />
            <div className="flex flex-col gap-1 md:col-span-2">
              <label htmlFor="bc-subject" className="font-mono text-[10px] uppercase tracking-[0.12em]">
                Subjek
              </label>
              <Input id="bc-subject" name="subject" placeholder="Pengumuman platform / promo" required />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label htmlFor="bc-body" className="font-mono text-[10px] uppercase tracking-[0.12em]">
                Isi pesan
              </label>
              <textarea
                id="bc-body"
                name="body"
                rows={6}
                placeholder={"Baris ganda = paragraf baru"}
                className="w-full rounded-none border-2 border-ink bg-surface px-3 py-2 font-mono text-sm shadow-[2px_2px_0_0_#111111] outline-none focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                required
              />
            </div>
            <BrutalistSelect name="audience" label="Audiens" defaultValue="all" options={AUDIENCE_OPTIONS} />
            <div className="flex flex-col gap-1">
              <label htmlFor="bc-max-resend" className="font-mono text-[10px] uppercase tracking-[0.12em]">
                Limit resend (0–10)
              </label>
              <Input id="bc-max-resend" name="max_resend" type="number" min={0} max={10} defaultValue={3} />
            </div>
          </AdminActionForm>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {broadcasts.length === 0 ? (
          <AdminEmptyState heading="/// BELUM ADA BROADCAST">
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
              <details key={b.id} className="border-2 border-ink bg-surface shadow-[4px_4px_0_0_#111111]">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 p-4">
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="font-display text-lg uppercase tracking-tight">{b.subject}</span>
                    <span className="border-2 border-ink bg-accent px-2 py-0.5 font-mono text-[10px] uppercase">
                      {BROADCAST_KIND_LABEL[b.kind] ?? b.kind}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      AUDIENS {b.audience.toUpperCase()} · TEMPLATE {b.template_key}
                    </span>
                  </span>
                  <StatusBadge status={statusFor(b.status)} />
                </summary>

                <div className="border-t-2 border-ink/10 p-4">
                  <pre className="whitespace-pre-wrap border-2 border-ink/20 bg-bg p-3 font-mono text-xs leading-relaxed">
                    {b.body}
                  </pre>

                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    {sentText} · RESEND {b.resend_count}/{b.max_resend}
                    {s && s.failed > 0 ? ` · GAGAL ${s.failed}` : ""}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t-2 border-ink/10 pt-4">
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
                        variant="outline"
                        submitClassName="min-h-11"
                      />
                    )}
                    {resendExhausted && (
                      <p className="font-mono text-xs text-muted-foreground">
                        Batas resend tercapai ({b.resend_count}/{b.max_resend})
                      </p>
                    )}
                  </div>

                  <RecipientHistory campaignId={b.id} />
                </div>
              </details>
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
      <p className="mt-4 font-mono text-xs text-muted-foreground">
        Belum ada penerima. Kirim broadcast untuk melihat riwayat pengiriman.
      </p>
    );
  }
  const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="mt-4">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        Riwayat Pengiriman ({recipients.length})
      </p>
      <div className="max-h-96 overflow-x-auto overflow-y-auto border-2 border-ink/20">
        <table className="w-full border-collapse font-mono text-xs">
          <thead className="sticky top-0 bg-bg">
            <tr className="border-b-2 border-ink text-left">
              <th className="p-2 font-bold">Penerima</th>
              <th className="p-2 font-bold">Jenis</th>
              <th className="p-2 font-bold">Status</th>
              <th className="p-2 font-bold">Resend</th>
              <th className="p-2 font-bold">Terakhir</th>
              <th className="p-2 font-bold">ID / Error</th>
            </tr>
          </thead>
          <tbody>
            {recipients.map((r) => (
              <tr key={r.id} className="border-b border-ink/10 align-top">
                <td className="p-2">
                  <span className="font-bold">{r.name ?? r.email}</span>
                  <br />
                  <span className="text-[10px] text-muted-foreground">{r.email}</span>
                </td>
                <td className="p-2 uppercase">{r.kind}</td>
                <td className="p-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="p-2">{r.resend_count}x</td>
                <td className="p-2 text-[10px]">
                  {r.last_sent_at ? dateFmt.format(new Date(r.last_sent_at)) : "-"}
                </td>
                <td className="p-2 break-all text-[10px]">
                  {r.provider_message_id ? (
                    <span className="text-muted-foreground">{r.provider_message_id}</span>
                  ) : (
                    <span className="text-destructive">{r.error ?? r.last_error ?? "-"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
