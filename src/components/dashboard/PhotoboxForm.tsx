"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fieldError } from "@/lib/form-ui";
import { slugify } from "@/lib/slug";
import type { FormState } from "@/server/auth-actions";
import type { PhotoboxRow } from "@/server/photoboxes";
import { savePhotoboxAction } from "@/server/booth-actions";
import {
  TurnstileWidget,
  type TurnstileHandle,
  type TurnstileStatus,
} from "@/components/turnstile-widget";

const initial: FormState = {};

type OutletOption = { id: string; name: string };

type Props = {
  outlets: OutletOption[];
  photobox?: PhotoboxRow;
  onDone?: () => void;
};

/**
 * PhotoboxForm — identitas + kebijakan bisnis booth (docs/04 §4.6, docs/12 Phase 3).
 * Setelan kamera/printer/sesi milik aplikasi booth, bukan dashboard.
 * Slug auto dari nama; URL publik /p/[businessSlug]/[photoboxSlug].
 */
export function PhotoboxForm({ outlets, photobox, onDone }: Props) {
  const isEdit = Boolean(photobox);
  const [state, formAction, pending] = useActionState(savePhotoboxAction, initial);
  const [name, setName] = useState(photobox?.name ?? "");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slug, setSlug] = useState(photobox?.slug ?? "");
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [captchaStatus, setCaptchaStatus] = useState<TurnstileStatus>("idle");
  const turnstileRef = useRef<TurnstileHandle>(null);

  const captchaSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  // Gate CAPTCHA hanya untuk CREATE (edit tak butuh) dan saat site key aktif.
  const captchaBlocked = !isEdit && Boolean(captchaSiteKey) && !captchaVerified;
  const captchaFailed = !isEdit && captchaStatus === "error";

  const effectiveSlug = slugEdited ? slug : isEdit ? (photobox?.slug ?? "") : slugify(name);
  const uid = photobox?.id ?? "new";

  // Tutup/reset panel setelah simpan sukses. useActionState tak punya status
  // "sukses" eksplisit; transisi pending true→false tanpa state.error menandai
  // simpan berhasil. Guard ref agar callback hanya sekali per submit.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) onDone?.();
    wasPending.current = pending;
  }, [pending, state.error, onDone]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 border-2 border-ink bg-surface p-4 shadow-hard"
      noValidate
    >
      {isEdit && photobox && <input type="hidden" name="id" value={photobox.id} />}
      <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
        {isEdit ? `UBAH PHOTOBOX: ${photobox?.name.toUpperCase()}` : "PHOTOBOX BARU"}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <fieldset className="grid grid-cols-1 gap-4 border-2 border-ink p-4 md:col-span-2 md:grid-cols-2">
          <legend className="px-2 font-mono text-xs font-bold uppercase tracking-[0.1em]">
            Identitas booth
          </legend>

          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-name-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Nama booth *
            </label>
            <Input
              id={`pb-name-${uid}`}
              name="name"
              required
              placeholder="cth. Booth 01"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              aria-invalid={Boolean(fieldError(state, "name"))}
            />
            {fieldError(state, "name") && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {fieldError(state, "name")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-slug-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Slug URL {isEdit ? "" : "(opsional, auto dari nama)"}
            </label>
            <Input
              id={`pb-slug-${uid}`}
              name="slug"
              placeholder="booth-01"
              value={
                isEdit
                  ? slugEdited
                    ? slug
                    : (photobox?.slug ?? "")
                  : slugEdited
                    ? slug
                    : effectiveSlug
              }
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value);
              }}
              disabled={pending}
              aria-invalid={Boolean(fieldError(state, "slug"))}
            />
            {fieldError(state, "slug") ? (
              <p role="alert" className="font-mono text-xs text-destructive">
                {fieldError(state, "slug")}
              </p>
            ) : (
              <p className="font-mono text-xs text-muted-foreground">
                /p/&lt;business-slug&gt;/{effectiveSlug || "slug-booth"}: URL perangkat kiosk (bukan
                untuk promosi); dipakai device photo &amp; customer melihat / mengunduh foto hasil.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-outlet-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Outlet *
            </label>
            <Select
              id={`pb-outlet-${uid}`}
              name="outlet_id"
              required
              defaultValue={photobox?.outlet_id ?? outlets[0]?.id ?? ""}
              disabled={pending || outlets.length === 0}
              aria-invalid={Boolean(fieldError(state, "outlet_id"))}
            >
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
            {fieldError(state, "outlet_id") && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {fieldError(state, "outlet_id")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-status-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Status
            </label>
            <Select
              id={`pb-status-${uid}`}
              name="status"
              defaultValue={photobox?.status ?? "offline"}
              disabled={pending}
            >
              <option value="online">ONLINE</option>
              <option value="offline">OFFLINE</option>
              <option value="maintenance">MAINTENANCE</option>
            </Select>
          </div>
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-4 border-2 border-ink p-4 md:col-span-2 md:grid-cols-2">
          <legend className="px-2 font-mono text-xs font-bold uppercase tracking-[0.1em]">
            Kebijakan bisnis
          </legend>

          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-payment-mode-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Saluran pembayaran booth
            </label>
            <Select
              id={`pb-payment-mode-${uid}`}
              name="payment_mode"
              defaultValue={photobox?.payment_mode ?? ""}
              disabled={pending}
            >
              <option value="">Gateway + Voucher</option>
              <option value="gateway">Hanya Payment Gateway</option>
              <option value="voucher">Hanya Voucher</option>
            </Select>
            <p className="font-mono text-xs text-muted-foreground">
              Channel yang tampil di kiosk booth ini. Berlaku saat business punya lebih dari satu
              booth.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-copies-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Salinan cetak
            </label>
            <Input
              id={`pb-copies-${uid}`}
              name="copies"
              type="number"
              min={1}
              max={20}
              defaultValue={photobox?.print_settings.copies ?? 1}
              disabled={pending}
            />
            <p className="font-mono text-xs text-muted-foreground">
              Jumlah lembar per sesi. Menentukan biaya bahan booth.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-layout-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Layout cetak
            </label>
            <Select
              id={`pb-layout-${uid}`}
              name="print_layout"
              defaultValue={photobox?.print_settings.layout ?? "single"}
              disabled={pending}
            >
              <option value="single">Single</option>
              <option value="strip">Photostrip</option>
            </Select>
            <p className="font-mono text-xs text-muted-foreground">
              Bentuk hasil yang diterima pelanggan.
            </p>
          </div>
        </fieldset>
      </div>

      <p className="max-w-[60ch] font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {"KAMERA, PRINTER, DAN DURASI SESI DIATUR DARI APLIKASI BOOTH"}
      </p>

      {state.error && (
        <p
          role="alert"
          className="border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs text-ink"
        >
          {state.error}
        </p>
      )}

      {!isEdit && (
        <TurnstileWidget
          ref={turnstileRef}
          siteKey={captchaSiteKey}
          action="create-photobox"
          onVerified={setCaptchaVerified}
          onStatus={setCaptchaStatus}
        />
      )}
      {captchaFailed && (
        <div
          role="alert"
          className="flex flex-col gap-2 border-2 border-destructive bg-destructive/10 px-3 py-2 font-mono text-xs leading-relaxed text-ink"
        >
          <p>Verifikasi keamanan gagal dimuat. Periksa koneksi lalu coba lagi.</p>
          <button
            type="button"
            onClick={() => void turnstileRef.current?.reset()}
            className="min-h-11 w-full border-2 border-ink bg-surface px-3 font-mono text-xs font-bold uppercase tracking-[0.05em] text-ink shadow-hard-sm transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Coba verifikasi lagi
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          type="submit"
          size="sm"
          disabled={pending || outlets.length === 0 || captchaBlocked}
        >
          {pending
            ? "Menyimpan…"
            : isEdit
              ? "Simpan perubahan"
              : captchaFailed
                ? "Verifikasi gagal"
                : captchaBlocked
                  ? "Menunggu verifikasi…"
                  : "Simpan photobox"}
        </Button>
        {onDone && (
          <Button type="button" variant="outline" size="sm" onClick={onDone} disabled={pending}>
            Batal
          </Button>
        )}
      </div>
    </form>
  );
}
