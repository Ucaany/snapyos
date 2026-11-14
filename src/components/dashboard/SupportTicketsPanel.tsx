"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CircleHelp, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RecordCollection } from "@/components/ui/record-collection";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/dashboard/StatusBadge";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AdminSelect } from "@/components/admin/AdminSelect";
import {
  STATUS_LABEL,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_AREAS,
} from "@/lib/support-ticket-constants";
import type { SupportTicket } from "@/server/support-tickets";
import { submitSupportTicketAction } from "@/server/support-ticket-actions";
import type { FormState } from "@/server/auth-actions";

const initial: FormState = {};

const CATEGORY_OPTIONS = [...SUPPORT_TICKET_CATEGORIES];
const AREA_OPTIONS = [...SUPPORT_TICKET_AREAS];

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });

export function SupportTicketsPanel({ tickets }: { tickets: SupportTicket[] }) {
  const [state, action, pending] = useActionState(submitSupportTicketAction, initial);

  function ticketCard(t: SupportTicket) {
    return (
      <Link
        href={`/dashboard/support/${t.id}`}
        className="block border-2 border-ink bg-surface p-4 shadow-hard transition-transform active:translate-y-[2px]"
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {`${t.category} · ${t.area}`}
            </p>
            <h2 className="min-w-0 break-words font-display text-lg uppercase tracking-tight">
              {t.subject}
            </h2>
          </div>
          <StatusBadge status={t.status} label={STATUS_LABEL[t.status]} />
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {t.description}
        </p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {dateFmt.format(new Date(t.created_at))} · {STATUS_LABEL[t.status]}
        </p>
      </Link>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Collapsible>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
            {`TIKET ${String(tickets.length).padStart(2, "0")}`}
          </p>
          <CollapsibleTrigger aria-label="Buka form tiket baru" title="Tiket baru">
            <Plus aria-hidden />
            <span className="sr-only">Tiket baru</span>
          </CollapsibleTrigger>
        </div>
        <CollapsiblePanel className="mt-4">
          <form
            action={action}
            className="flex flex-col gap-6 border-2 border-ink bg-surface p-5 shadow-hard md:p-6"
            noValidate
          >
            <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
              {"Laporkan masalah"}
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="font-mono text-xs font-bold uppercase tracking-[0.1em]">
                  Subjek
                </span>
                <input
                  name="subject"
                  required
                  maxLength={200}
                  placeholder="Ringkas masalah Anda"
                  className="border-2 border-ink bg-bg px-3 py-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                />
              </label>

              <AdminSelect
                name="category"
                label="Kategori"
                options={CATEGORY_OPTIONS.map((c) => ({ value: c, label: c.toUpperCase() }))}
              />
              <AdminSelect
                name="area"
                label="Bagian yang bermasalah"
                options={AREA_OPTIONS.map((a) => ({ value: a, label: a.toUpperCase() }))}
              />
            </div>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs font-bold uppercase tracking-[0.1em]">
                Ceritakan masalahnya
              </span>
              <textarea
                name="description"
                required
                maxLength={4000}
                rows={5}
                placeholder="Jelaskan apa yang terjadi, kapan, dan langkah yang sudah dicoba."
                className="resize-y border-2 border-ink bg-bg px-3 py-2 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
            </label>

            {state?.error ? (
              <p role="alert" className="font-mono text-xs font-bold uppercase text-ink">
                {state.error}
              </p>
            ) : null}

            <Button type="submit" disabled={pending} className="w-fit">
              {pending ? "Mengirim…" : "Kirim tiket"}
            </Button>
          </form>
        </CollapsiblePanel>
      </Collapsible>

      {tickets.length === 0 ? (
        <EmptyState
          icon={CircleHelp}
          eyebrow="TIKET BANTUAN"
          title="Belum ada tiket"
          body="Laporkan masalah atau pertanyaan Anda melalui tombol Tiket baru. Tim SnapyOS akan menindaklanjuti dari sini."
        />
      ) : (
        <RecordCollection
          storageKey="snapyos.view.support-tickets"
          label="Daftar tiket bantuan"
          mobileDefault="list"
          list={
            <ul className="flex flex-col gap-3">
              {tickets.map((t) => (
                <li key={t.id}>{ticketCard(t)}</li>
              ))}
            </ul>
          }
          grid={
            <ul
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
              aria-label="Tiket bantuan (tampilan kotak)"
            >
              {tickets.map((t) => (
                <li key={t.id} className="min-w-0">
                  {ticketCard(t)}
                </li>
              ))}
            </ul>
          }
        />
      )}
    </div>
  );
}
