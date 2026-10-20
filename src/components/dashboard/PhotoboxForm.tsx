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
 * PhotoboxForm — create/edit booth (docs/04 §4.6, docs/12 Phase 3).
 * Slug auto dari nama; URL publik /p/[businessSlug]/[photoboxSlug].
 */
export function PhotoboxForm({ outlets, photobox, onDone }: Props) {
  const isEdit = Boolean(photobox);
  const [state, formAction, pending] = useActionState(savePhotoboxAction, initial);
  const [name, setName] = useState(photobox?.name ?? "");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slug, setSlug] = useState(photobox?.slug ?? "");
  const [unlimitedRetakes, setUnlimitedRetakes] = useState(
    photobox?.session_settings.max_retakes == null
  );
  const [printMode, setPrintMode] = useState<"browser" | "bluetooth">(
    photobox?.print_settings.mode === "bluetooth" ? "bluetooth" : "browser"
  );
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
      className="flex flex-col gap-4 border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_#111111]"
      noValidate
    >
      {isEdit && photobox && <input type="hidden" name="id" value={photobox.id} />}
      <p className="font-mono text-xs font-bold uppercase tracking-[0.15em]">
        {isEdit ? `UBAH PHOTOBOX: ${photobox?.name.toUpperCase()}` : "PHOTOBOX BARU"}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

        <div className="flex flex-col gap-2 md:col-span-2">
          <label
            htmlFor={`pb-exit-pin-${uid}`}
            className="font-mono text-xs uppercase tracking-[0.1em]"
          >
            PIN keluar kiosk {isEdit ? "(kosongkan = tidak diubah)" : "(opsional)"}
          </label>
          <input
            id={`pb-exit-pin-${uid}`}
            name="exit_pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            placeholder="4–8 digit"
            disabled={pending}
            aria-invalid={Boolean(fieldError(state, "exit_pin"))}
            className="h-11 w-full rounded-none border-2 border-ink bg-surface px-3 font-mono text-sm tracking-[0.3em] shadow-[2px_2px_0_0_#111111] outline-none focus-visible:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          />
          {fieldError(state, "exit_pin") ? (
            <p role="alert" className="font-mono text-xs text-destructive">
              {fieldError(state, "exit_pin")}
            </p>
          ) : (
            <p className="font-mono text-xs text-muted-foreground">
              Dipakai petugas untuk keluar dari mode kiosk photobox.{" "}
              {isEdit
                ? photobox?.has_exit_pin
                  ? "PIN aktif: isi nilai baru untuk mengganti."
                  : "PIN belum diatur: kiosk saat ini bisa keluar tanpa PIN."
                : "Tanpa PIN, kiosk keluar tanpa verifikasi."}
            </p>
          )}
        </div>

        <label className="flex items-start gap-3 border-2 border-ink bg-accent/20 p-3 md:col-span-2">
          <input
            type="checkbox"
            name="chroma_key_enabled"
            defaultChecked={photobox?.chroma_key_enabled}
            disabled={pending}
            className="mt-0.5 size-4"
          />
          <span>
            <span className="block font-mono text-xs font-bold uppercase tracking-[0.1em]">
              Aktifkan chroma key di booth
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Template PNG dapat menghapus background hijau langsung di builder. Booth memakai
              konfigurasi ini sebagai penanda operasi.
            </span>
          </span>
        </label>

        <fieldset className="grid grid-cols-1 gap-4 border-2 border-ink p-4 md:col-span-2 md:grid-cols-2">
          <legend className="px-2 font-mono text-xs font-bold uppercase tracking-[0.1em]">
            Pembayaran
          </legend>
          <div className="flex flex-col gap-2 md:col-span-2">
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
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-4 border-2 border-ink p-4 md:col-span-2 md:grid-cols-3">
          <legend className="px-2 font-mono text-xs font-bold uppercase tracking-[0.1em]">
            Sesi &amp; retake
          </legend>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-timer-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Durasi sesi (detik)
            </label>
            <Input
              id={`pb-timer-${uid}`}
              name="timer_seconds"
              type="number"
              min={60}
              max={3600}
              defaultValue={photobox?.session_settings.timer_seconds ?? 300}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-warning-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Peringatan (detik)
            </label>
            <Input
              id={`pb-warning-${uid}`}
              name="warning_seconds"
              type="number"
              min={10}
              max={600}
              defaultValue={photobox?.session_settings.warning_seconds ?? 60}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-retake-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Maksimal retake
            </label>
            <Input
              id={`pb-retake-${uid}`}
              name="max_retakes"
              type="number"
              min={0}
              max={50}
              defaultValue={photobox?.session_settings.max_retakes ?? 1}
              disabled={pending || unlimitedRetakes}
            />
            <label className="flex items-center gap-2 font-mono text-xs uppercase">
              <input
                type="checkbox"
                name="unlimited_retakes"
                checked={unlimitedRetakes}
                onChange={(event) => setUnlimitedRetakes(event.target.checked)}
                disabled={pending}
                className="size-4"
              />
              Tanpa batas
            </label>
          </div>
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-4 border-2 border-ink p-4 md:col-span-2 md:grid-cols-3">
          <legend className="px-2 font-mono text-xs font-bold uppercase tracking-[0.1em]">
            Kamera
          </legend>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-countdown-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Countdown
            </label>
            <Select
              id={`pb-countdown-${uid}`}
              name="countdown_seconds"
              defaultValue={photobox?.camera_settings.countdown_seconds ?? 3}
              disabled={pending}
            >
              <option value="1">1 detik</option>
              <option value="3">3 detik</option>
              <option value="5">5 detik</option>
              <option value="10">10 detik</option>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-facing-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Arah kamera
            </label>
            <Select
              id={`pb-facing-${uid}`}
              name="facing_mode"
              defaultValue={photobox?.camera_settings.facingMode ?? "environment"}
              disabled={pending}
            >
              <option value="environment">Belakang / USB</option>
              <option value="user">Depan</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <label htmlFor={`pb-width-${uid}`} className="font-mono text-xs uppercase">
                Lebar
              </label>
              <Input
                id={`pb-width-${uid}`}
                name="capture_width"
                type="number"
                min={640}
                max={7680}
                defaultValue={photobox?.camera_settings.capture_width ?? 1920}
                disabled={pending}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor={`pb-height-${uid}`} className="font-mono text-xs uppercase">
                Tinggi
              </label>
              <Input
                id={`pb-height-${uid}`}
                name="capture_height"
                type="number"
                min={480}
                max={4320}
                defaultValue={photobox?.camera_settings.capture_height ?? 1080}
                disabled={pending}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-quality-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Kualitas JPEG
            </label>
            <Input
              id={`pb-quality-${uid}`}
              name="jpeg_quality"
              type="number"
              min={0.5}
              max={1}
              step={0.01}
              defaultValue={photobox?.camera_settings.jpeg_quality ?? 0.92}
              disabled={pending}
            />
          </div>
          <label className="flex items-center gap-2 font-mono text-xs uppercase">
            <input
              type="checkbox"
              name="mirror_preview"
              defaultChecked={photobox?.camera_settings.mirror_preview ?? true}
              disabled={pending}
              className="size-4"
            />{" "}
            Mirror preview
          </label>
          <label className="flex items-center gap-2 font-mono text-xs uppercase">
            <input
              type="checkbox"
              name="fullscreen"
              defaultChecked={photobox?.camera_settings.fullscreen ?? true}
              disabled={pending}
              className="size-4"
            />{" "}
            Fullscreen
          </label>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-rotation-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Rotasi kalibrasi
            </label>
            <Select
              id={`pb-rotation-${uid}`}
              name="rotation_degrees"
              defaultValue={photobox?.camera_settings.rotation_degrees ?? 0}
              disabled={pending}
            >
              <option value="0">0°</option>
              <option value="90">90°</option>
              <option value="180">180°</option>
              <option value="270">270°</option>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-zoom-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Zoom kalibrasi
            </label>
            <Input
              id={`pb-zoom-${uid}`}
              name="zoom"
              type="number"
              min={1}
              max={5}
              step={0.1}
              defaultValue={photobox?.camera_settings.zoom ?? 1}
              disabled={pending}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`pb-screen-orientation-${uid}`}
              className="font-mono text-xs uppercase tracking-[0.1em]"
            >
              Orientasi layar
            </label>
            <Select
              id={`pb-screen-orientation-${uid}`}
              name="screen_orientation"
              defaultValue={photobox?.camera_settings.screen_orientation ?? "landscape"}
              disabled={pending}
            >
              <option value="landscape">Landscape</option>
              <option value="portrait">Portrait</option>
            </Select>
          </div>
        </fieldset>

        <fieldset className="grid grid-cols-1 gap-4 border-2 border-ink p-4 md:col-span-2 md:grid-cols-3">
          <legend className="px-2 font-mono text-xs font-bold uppercase tracking-[0.1em]">
            Cetak
          </legend>
          <label className="flex items-center gap-2 font-mono text-xs uppercase">
            <input
              type="checkbox"
              name="print_enabled"
              defaultChecked={photobox?.print_settings.enabled ?? true}
              disabled={pending}
              className="size-4"
            />{" "}
            Printer aktif
          </label>
          <label className="flex items-center gap-2 font-mono text-xs uppercase">
            <input
              type="checkbox"
              name="auto_print"
              defaultChecked={photobox?.print_settings.auto_print ?? true}
              disabled={pending}
              className="size-4"
            />{" "}
            Cetak otomatis
          </label>
          <div className="flex flex-col gap-2">
            <label htmlFor={`pb-print-mode-${uid}`} className="font-mono text-xs uppercase">
              Jalur cetak
            </label>
            <Select
              id={`pb-print-mode-${uid}`}
              name="print_mode"
              defaultValue={photobox?.print_settings.mode ?? "browser"}
              disabled={pending}
              onChange={(event) =>
                setPrintMode(event.target.value === "bluetooth" ? "bluetooth" : "browser")
              }
            >
              <option value="browser">Dialog sistem (printer foto)</option>
              <option value="bluetooth">Bluetooth thermal (ESC/POS)</option>
            </Select>
          </div>
          {printMode === "bluetooth" ? (
            <>
              <div className="flex flex-col gap-2">
                <label htmlFor={`pb-bt-width-${uid}`} className="font-mono text-xs uppercase">
                  Lebar kertas thermal
                </label>
                <Select
                  id={`pb-bt-width-${uid}`}
                  name="bluetooth_paper_width_mm"
                  defaultValue={String(photobox?.print_settings.bluetooth_paper_width_mm ?? 80)}
                  disabled={pending}
                >
                  <option value="80">80 mm</option>
                  <option value="58">58 mm</option>
                </Select>
              </div>
              <div className="flex flex-col gap-2 md:col-span-1">
                <label htmlFor={`pb-bt-name-${uid}`} className="font-mono text-xs uppercase">
                  Nama printer
                </label>
                <Input
                  id={`pb-bt-name-${uid}`}
                  name="bluetooth_device_name"
                  defaultValue={photobox?.print_settings.bluetooth_device_name ?? ""}
                  placeholder="cth. RPP02"
                  maxLength={60}
                  disabled={pending}
                />
              </div>
              <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[0.08em] text-muted-foreground md:col-span-2">
                {
                  "KHUSUS PRINTER THERMAL ESC/POS · BUTUH CHROME + BLUETOOTH · PRINTER FOTO KONSUMEN TETAP PAKAI DIALOG SISTEM"
                }
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <label htmlFor={`pb-paper-${uid}`} className="font-mono text-xs uppercase">
                  Ukuran kertas
                </label>
                <Select
                  id={`pb-paper-${uid}`}
                  name="paper_size"
                  defaultValue={photobox?.print_settings.paper_size ?? "4x6"}
                  disabled={pending}
                >
                  <option value="4x6">4 × 6 inci</option>
                  <option value="A6">A6</option>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor={`pb-layout-${uid}`} className="font-mono text-xs uppercase">
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
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor={`pb-orientation-${uid}`} className="font-mono text-xs uppercase">
                  Orientasi
                </label>
                <Select
                  id={`pb-orientation-${uid}`}
                  name="orientation"
                  defaultValue={photobox?.print_settings.orientation ?? "portrait"}
                  disabled={pending}
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor={`pb-margin-${uid}`} className="font-mono text-xs uppercase">
                  Margin mm
                </label>
                <Input
                  id={`pb-margin-${uid}`}
                  name="margins_mm"
                  type="number"
                  min={0}
                  max={20}
                  defaultValue={photobox?.print_settings.margins_mm ?? 0}
                  disabled={pending}
                />
              </div>
            </>
          )}
          <div className="flex flex-col gap-2">
            <label htmlFor={`pb-copies-${uid}`} className="font-mono text-xs uppercase">
              Salinan
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
          </div>
        </fieldset>
      </div>

      <p className="max-w-[60ch] font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {"DEVICE DIPILIH SAAT PAIRING · PENGATURAN DI ATAS MENGONTROL RUNTIME KIOSK"}
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
            className="min-h-11 w-full border-2 border-ink bg-surface px-3 font-mono text-xs font-bold uppercase tracking-[0.05em] text-ink shadow-[2px_2px_0_0_#111111] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
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
