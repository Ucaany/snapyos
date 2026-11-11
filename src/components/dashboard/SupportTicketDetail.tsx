"use client";

import { useActionState } from "react";
import { ArrowLeft, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconLink } from "@/components/ui/icon-button";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { STATUS_LABEL } from "@/lib/support-ticket-constants";
import type { SupportTicketDetail } from "@/server/support-tickets";
import { replySupportTicketAction } from "@/server/support-ticket-actions";
import type { FormState } from "@/server/auth-actions";

const initial: FormState = {};

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

export function SupportTicketDetail({ ticket }: { ticket: SupportTicketDetail }) {
  const [state, action, pending] = useActionState(replySupportTicketAction, initial);

  return (
    <div className="flex flex-col gap-6">
      <IconLink
        href="/dashboard/support"
        label="Kembali ke daftar tiket"
        icon={ArrowLeft}
        compact
      />

      <div className="border-2 border-ink bg-surface p-5 shadow-hard md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {`${ticket.category} · ${ticket.area}`}
            </p>
            <h2 className="font-display text-2xl uppercase tracking-tight">{ticket.subject}</h2>
          </div>
          <StatusBadge status={ticket.status} label={STATUS_LABEL[ticket.status]} />
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {ticket.description}
        </p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {dateFmt.format(new Date(ticket.created_at))} · status {STATUS_LABEL[ticket.status]}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
          {"Riwayat balasan"}
        </p>
        {ticket.replies.length === 0 ? (
          <div className="flex items-center gap-3 border-2 border-dashed border-ink/40 bg-muted p-6">
            <MessageSquare className="size-6" aria-hidden />
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
              Belum ada balasan dari tim SnapyOS.
            </p>
          </div>
        ) : (
          ticket.replies.map((r) => (
            <div key={r.id} className="border-2 border-ink bg-bg p-4 shadow-hard">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                {r.author_name ?? "Tim SnapyOS"} · {dateFmt.format(new Date(r.created_at))}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{r.body}</p>
            </div>
          ))
        )}
      </div>

      {ticket.status !== "resolved" ? (
        <form
          action={action}
          className="flex flex-col gap-4 border-2 border-ink bg-surface p-5 shadow-hard md:p-6"
          noValidate
        >
          <input type="hidden" name="ticketId" value={ticket.id} />
          <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
            {"Tambah balasan"}
          </p>
          <textarea
            name="body"
            required
            maxLength={4000}
            rows={4}
            placeholder="Tulis balasan untuk tim SnapyOS…"
            className="resize-y border-2 border-ink bg-bg px-3 py-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
          {state?.error ? (
            <p role="alert" className="font-mono text-xs font-bold uppercase text-ink">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-fit">
            {pending ? "Mengirim…" : "Kirim balasan"}
          </Button>
        </form>
      ) : (
        <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
          {"TIKET SELESAI: tidak menerima balasan baru"}
        </p>
      )}
    </div>
  );
}
