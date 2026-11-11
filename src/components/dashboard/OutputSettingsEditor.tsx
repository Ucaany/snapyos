"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/server/auth-actions";
import { updateOutputSettingsAction } from "@/server/branding-actions";

const initial: FormState = {};

type Props = {
  gifEnabled: boolean;
  frameDelayMs: number | null;
  maxWidth: number | null;
  canWrite: boolean;
};

/**
 * OutputSettingsEditor — setelan GIF hasil sesi (docs/05 §5.13): aktif/mati,
 * delay antar frame 100–3000 ms, lebar output 240–1080 px. Berlaku saat
 * finalize berikutnya; sesi yang sudah selesai tidak diubah ulang.
 */
export function OutputSettingsEditor({ gifEnabled, frameDelayMs, maxWidth, canWrite }: Props) {
  const [state, formAction, pending] = useActionState(updateOutputSettingsAction, initial);
  const [touched, setTouched] = useState(false);
  const [delay, setDelay] = useState(String(frameDelayMs ?? 800));
  const [width, setWidth] = useState(String(maxWidth ?? 480));

  const delayError = state.fieldErrors?.["frame_delay_ms"]?.[0];
  const widthError = state.fieldErrors?.["max_width"]?.[0];

  return (
    <form action={formAction} onSubmit={() => setTouched(true)} noValidate className="contents">
      <section
        className="border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_0_#111111]"
        aria-labelledby="output-settings-heading"
      >
        <div className="mb-5 flex items-center justify-between gap-4 border-b-2 border-ink pb-4">
          <h2
            id="output-settings-heading"
            className="font-display text-lg uppercase tracking-tight"
          >
            Output GIF
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            05 / OUTPUT
          </span>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              name="gif_enabled"
              defaultChecked={gifEnabled}
              disabled={pending || !canWrite}
              className="size-5 border-2 border-ink accent-ink"
            />
            <span className="font-mono text-xs uppercase tracking-[0.1em]">
              Buat GIF slideshow tiap sesi
            </span>
          </label>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="gif-frame-delay"
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Delay antar frame (ms)
            </label>
            <div className="flex max-w-[240px] items-center gap-3">
              <Input
                id="gif-frame-delay"
                name="frame_delay_ms"
                type="number"
                min={100}
                max={3000}
                step={50}
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
                disabled={pending || !canWrite}
                aria-invalid={Boolean(delayError)}
              />
              <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
                ms
              </span>
            </div>
            {delayError ? (
              <p role="alert" className="font-mono text-xs text-destructive">
                {delayError}
              </p>
            ) : (
              <p className="font-mono text-xs text-muted-foreground">
                Default 800 (rentang 100–3000).
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="gif-max-width" className="font-mono text-xs uppercase tracking-[0.1em]">
              Lebar maksimum (px)
            </label>
            <div className="flex max-w-[240px] items-center gap-3">
              <Input
                id="gif-max-width"
                name="max_width"
                type="number"
                min={240}
                max={1080}
                step={10}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                disabled={pending || !canWrite}
                aria-invalid={Boolean(widthError)}
              />
              <span className="font-mono text-xs uppercase tracking-[0.1em] text-muted-foreground">
                px
              </span>
            </div>
            {widthError ? (
              <p role="alert" className="font-mono text-xs text-destructive">
                {widthError}
              </p>
            ) : (
              <p className="font-mono text-xs text-muted-foreground">
                Default 480 (rentang 240–1080).
              </p>
            )}
          </div>
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
              {"TERSIMPAN"}
            </p>
          )}
        </div>
      </section>
    </form>
  );
}
