"use client";

import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitContactAction, type ContactState } from "@/server/contact-action";

const initial: ContactState = {};

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-xs text-destructive">{error}</p>;
}

export function ContactForm() {
  const [state, formAction, pending] = useActionState(submitContactAction, initial);
  const openedRef = useRef(false);

  useEffect(() => {
    if (state.waUrl && !openedRef.current) {
      openedRef.current = true;
      window.open(state.waUrl, "_blank", "noopener,noreferrer");
    }
  }, [state.waUrl]);

  const fieldErrors = state.fieldErrors ?? {};

  if (state.waUrl) {
    return (
      <div
        role="status"
        className="mt-6 border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]"
      >
        <p className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink">{"/// Pesan siap dikirim"}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          WhatsApp konsultasi terbuka di tab baru. Jika tidak terbuka,{" "}
          <a
            className="font-semibold text-ink underline underline-offset-4"
            href={state.waUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            buka chat manual
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="mt-6 space-y-4">
      <div className="grid gap-2">
        <label htmlFor="kontak-nama" className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink">
          Nama
        </label>
        <Input
          id="kontak-nama"
          name="name"
          required
          autoComplete="name"
          aria-invalid={Boolean(fieldErrors.name)}
        />
        <FieldError error={fieldErrors.name} />
      </div>
      <div className="grid gap-2">
        <label htmlFor="kontak-email" className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink">
          Email
        </label>
        <Input
          id="kontak-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-invalid={Boolean(fieldErrors.email)}
        />
        <FieldError error={fieldErrors.email} />
        {!fieldErrors.email && (
          <p className="text-xs text-muted-foreground">Balasan dikirim ke alamat ini.</p>
        )}
      </div>
      <div className="grid gap-2">
        <label htmlFor="kontak-pesan" className="font-mono text-xs font-bold uppercase tracking-[0.08em] text-ink">
          Pesan
        </label>
        <Textarea
          id="kontak-pesan"
          name="message"
          required
          className="min-h-32"
          placeholder="Contoh: booth di mal Jakarta, 1 kamera Canon, butuh QRIS Pakasir."
          aria-invalid={Boolean(fieldErrors.message)}
        />
        <FieldError error={fieldErrors.message} />
      </div>
      {state.error && (
        <div
          role="alert"
          className="border-2 border-destructive bg-surface px-4 py-3 text-sm leading-6 text-ink shadow-[4px_4px_0_0_#111111]"
        >
          {state.error}
        </div>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Mengirim…" : "Kirim pesan"}
      </Button>
    </form>
  );
}
