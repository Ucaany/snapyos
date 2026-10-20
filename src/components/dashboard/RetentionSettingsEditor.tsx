"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/server/auth-actions";
import { updateRetentionSettingsAction } from "@/server/branding-actions";

const initial: FormState = {};

type Props = {
  retentionDays: number | null;
  canWrite: boolean;
};

/**
 * RetentionSettingsEditor — masa simpan hasil foto owner-configurable
 * (kebijakan 1–3 hari). Setelah lewat batas: link result mati
 * otomatis dan media (foto + GIF) dihapus oleh cron retention harian.
 */
export function RetentionSettingsEditor({ retentionDays, canWrite }: Props) {
  const [state, formAction, pending] = useActionState(updateRetentionSettingsAction, initial);
  const [touched, setTouched] = useState(false);
  const [days, setDays] = useState(
    retentionDays !== null && retentionDays !== undefined ? String(retentionDays) : "3"
  );

  const fieldError = state.fieldErrors?.["retention_days"]?.[0];

  return (
    <form action={formAction} onSubmit={() => setTouched(true)} noValidate className="contents">
      <section
        className="border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]"
        aria-labelledby="retention-settings-heading"
      >
        <div className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
          <h2
            id="retention-settings-heading"
            className="font-display text-lg uppercase tracking-tight"
          >
            Retensi Hasil Foto
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            04 / RETENTION
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="retention-days" className="font-mono text-xs uppercase tracking-[0.1em]">
            Masa simpan hasil (hari)
          </label>
          <div className="flex max-w-[240px] items-center gap-3">
            <Input
              id="retention-days"
              name="retention_days"
              type="number"
              min={1}
              max={3}
              step={1}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              disabled={pending || !canWrite}
              aria-invalid={Boolean(fieldError)}
            />
            <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
              hari
            </span>
          </div>
          {fieldError ? (
            <p role="alert" className="font-mono text-xs text-destructive">
              {fieldError}
            </p>
          ) : (
            <p className="max-w-[65ch] font-mono text-xs leading-relaxed text-muted-foreground">
              Default 3 hari (rentang 1–3). Setelah lewat batas: link hasil (/r/token) otomatis mati
              dan foto + GIF dihapus permanen oleh sistem. Transaksi tetap tercatat.
            </p>
          )}
        </div>

        {state.error && (
          <p role="alert" className="mt-4 font-mono text-xs text-destructive">
            {state.error}
          </p>
        )}

        <div className="mt-5 flex items-center gap-4">
          <Button type="submit" disabled={pending || !canWrite} className="bg-accent">
            {pending ? "Menyimpan..." : "Simpan"}
          </Button>
          {touched && state.error === undefined && state.fieldErrors === undefined && (
            <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
              {"/// TERSIMPAN"}
            </p>
          )}
        </div>
      </section>
    </form>
  );
}
