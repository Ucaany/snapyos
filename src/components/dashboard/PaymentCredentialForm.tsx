"use client";

import { useState, type FormEvent } from "react";

import { Copy } from "lucide-react";

import { PaymentMethodSelector } from "@/components/dashboard/PaymentMethodSelector";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import {
  createCredentialAction,
  updateCredentialAction,
  type UpdateInput,
} from "@/server/payment-credential-actions";
import {
  PAYMENT_FIELD_LABELS,
  validatePaymentField,
  type PaymentCredentialPublic,
  type PaymentWebhookStatus,
} from "@/lib/payment-credentials";
import type { GatewayProvider } from "@/server/payment/providers/types";

const providerLabels: Record<GatewayProvider, string> = {
  pakasir: "Pakasir",
  midtrans: "Midtrans",
  tripay: "Tripay",
};

/** Field rahasia yang hanya diisi saat create (edit: kosong = pertahankan). */
const SECRET_FIELDS = ["server_key", "client_key", "private_key", "webhook_secret"] as const;
type SecretField = (typeof SECRET_FIELDS)[number];

/** Kewajiban field rahasia saat create — harus sama dengan schema zod server. */
const REQUIRED_ON_CREATE: Partial<Record<GatewayProvider, readonly SecretField[]>> = {
  pakasir: ["server_key", "webhook_secret"],
  midtrans: ["server_key"],
  tripay: ["server_key", "private_key"],
};

type Props = {
  credential?: PaymentCredentialPublic;
  /** Webhook URL/diagnosa per provider (dihitung server dari env). */
  webhookUrls?: Record<GatewayProvider, PaymentWebhookStatus>;
  onCancel?(): void;
  onSaved(): void;
};

/**
 * PaymentCredentialForm — tambah/ubah credential merchant owner (direct merchant).
 * Dana transaksi masuk rekening owner via merchant key sendiri (aggregaat Pakasir
 * platform dihapus 2026-09-18). Secret terenkripsi app-layer; never ditampilkan.
 * Field dinamis per provider + validasi format; minimal satu metode wajib dipilih.
 */
export function PaymentCredentialForm({ credential, webhookUrls, onCancel, onSaved }: Props) {
  const editing = credential !== undefined;
  const [provider, setProvider] = useState<GatewayProvider>(credential?.provider ?? "pakasir");
  const [environment, setEnvironment] = useState<"sandbox" | "production">(
    credential?.environment ?? "sandbox"
  );
  const [methods, setMethods] = useState<string[]>(credential?.enabled_methods ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [copied, setCopied] = useState(false);

  const labels = PAYMENT_FIELD_LABELS[provider];
  const webhook = webhookUrls?.[provider] ?? null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});
    setCopied(false);
    const form = new FormData(event.currentTarget);

    // Validasi format field dinamis (server tetap validasi ulang via zod).
    const local: Record<string, string[]> = {};
    const values: Partial<Record<SecretField, string>> = {};
    const merchantId = String(form.get("merchant_id") ?? "").trim();
    const merchantError = validatePaymentField(provider, "merchant_id", merchantId);
    if (merchantError) local.merchant_id = [merchantError];
    for (const field of SECRET_FIELDS) {
      const label = labels[field];
      if (!label) continue;
      const value = String(form.get(field) ?? "").trim();
      if (!value) {
        if (!editing && REQUIRED_ON_CREATE[provider]?.includes(field))
          local[field] = [`${label} wajib diisi`];
        continue;
      }
      const formatError = validatePaymentField(provider, field, value);
      if (formatError) local[field] = [formatError];
      else values[field] = value;
    }
    if (methods.length === 0) {
      local.enabled_methods = ["Pilih minimal satu metode pembayaran"];
    }
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      setError("Periksa kembali isian form.");
      setPending(false);
      return;
    }

    const common = {
      label: String(form.get("label") ?? "").trim() || null,
      merchant_id: merchantId,
      environment,
      is_active: form.get("is_active") === "on",
      enabled_methods: methods,
    };
    if (editing) {
      const input: UpdateInput = { ...common };
      if (values.server_key) input.server_key = values.server_key;
      if (values.client_key) input.client_key = values.client_key;
      if (values.private_key) input.private_key = values.private_key;
      if (values.webhook_secret) input.webhook_secret = values.webhook_secret;
      const result = await updateCredentialAction(credential!.id, input);
      if ("error" in result) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        setPending(false);
        return;
      }
    } else {
      const result = await createCredentialAction({
        provider,
        ...common,
        server_key: values.server_key ?? "",
        client_key: values.client_key || null,
        ...(values.private_key ? { private_key: values.private_key } : {}),
        ...(values.webhook_secret ? { webhook_secret: values.webhook_secret } : {}),
      });
      if ("error" in result) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        setPending(false);
        return;
      }
    }
    setPending(false);
    onSaved();
  }

  async function copyWebhook() {
    if (!webhook?.url) return;
    try {
      await navigator.clipboard.writeText(webhook.url);
      setCopied(true);
    } catch {
      setError("Browser memblokir penyalinan. Salin URL secara manual.");
    }
  }

  const fieldError = (name: string) =>
    fieldErrors[name]?.[0] ? (
      <p role="alert" className="font-mono text-xs normal-case tracking-normal text-destructive">
        {fieldErrors[name][0]}
      </p>
    ) : null;

  const textField = (field: SecretField | "merchant_id", options: { secret: boolean }) => {
    const label = PAYMENT_FIELD_LABELS[provider][field];
    if (!label) return null;
    const keepHint = editing && options.secret ? "Kosongkan untuk mempertahankan" : undefined;
    return (
      <label key={field} className="grid gap-1 font-mono text-xs uppercase tracking-[0.08em]">
        {label}
        <Input
          name={field}
          defaultValue={field === "merchant_id" ? (credential?.merchant_id ?? "") : undefined}
          required={
            field === "merchant_id" ||
            (!editing && Boolean(REQUIRED_ON_CREATE[provider]?.includes(field)))
          }
          type={options.secret ? "password" : "text"}
          autoComplete={options.secret ? "new-password" : "off"}
          maxLength={field === "merchant_id" ? 160 : 4000}
          placeholder={keepHint}
          disabled={pending}
        />
        {fieldError(field)}
      </label>
    );
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="grid gap-4 border-2 border-ink bg-surface p-5 shadow-hard"
    >
      <div className="flex items-center justify-between gap-3 border-b-2 border-ink pb-3">
        <h2 className="font-display text-xl uppercase tracking-tight">
          {editing ? "Ubah Gateway" : "Tambah Gateway"}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em]">[ CREDENTIAL ]</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 font-mono text-xs uppercase tracking-[0.08em]">
          Penyedia
          <select
            value={provider}
            disabled={editing || pending}
            onChange={(event) => {
              setProvider(event.target.value as GatewayProvider);
              setMethods([]);
            }}
            className="h-11 border-2 border-ink bg-surface px-3 text-sm normal-case shadow-hard-sm disabled:opacity-50"
          >
            {Object.entries(providerLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 font-mono text-xs uppercase tracking-[0.08em]">
          Lingkungan
          <select
            value={environment}
            disabled={pending}
            onChange={(event) => setEnvironment(event.target.value as "sandbox" | "production")}
            className="h-11 border-2 border-ink bg-surface px-3 text-sm normal-case shadow-hard-sm disabled:opacity-50"
          >
            <option value="sandbox">Sandbox</option>
            <option value="production">Production</option>
          </select>
        </label>
      </div>

      <label className="grid gap-1 font-mono text-xs uppercase tracking-[0.08em]">
        Label
        <Input
          name="label"
          defaultValue={credential?.label ?? ""}
          maxLength={80}
          placeholder={`${providerLabels[provider]} utama`}
          disabled={pending}
        />
        {fieldError("label")}
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        {textField("merchant_id", { secret: false })}
        {textField("server_key", { secret: true })}
        {textField("client_key", { secret: true })}
        {textField("private_key", { secret: true })}
        {textField("webhook_secret", { secret: true })}
      </div>

      <PaymentMethodSelector
        provider={provider}
        selected={methods}
        disabled={pending}
        onChange={setMethods}
      />
      {fieldError("enabled_methods")}

      {webhook && (
        <div className="grid gap-2 border-2 border-ink bg-muted p-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em]">Webhook URL</span>
          {webhook.url ? (
            <>
              <code className="break-all font-mono text-xs">{webhook.url}</code>
              <IconButton
                label={copied ? "Tersalin" : "Salin webhook URL"}
                icon={Copy}
                compact
                onClick={() => void copyWebhook()}
              />
              {copied && (
                <p role="status" className="font-mono text-[10px] uppercase tracking-[0.08em]">
                  Webhook URL disalin
                </p>
              )}
            </>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Webhook nonaktif: {webhook.reason}
            </p>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.08em]">
        <input
          name="is_active"
          type="checkbox"
          defaultChecked={credential?.is_active ?? true}
          disabled={pending}
          className="size-4 accent-ink"
        />
        Aktifkan credential
      </label>

      {provider === "pakasir" && (
        <p className="border-l-4 border-accent bg-muted p-3 font-mono text-xs">
          Pakasir verifikasi pembayaran server-to-server + header X-Secret (webhook secret v2, ambil
          di Detail Proyek Pakasir). Dana masuk project merchant owner, bukan rekening platform.
        </p>
      )}

      {error && (
        <p role="alert" className="font-mono text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan..." : editing ? "Simpan Perubahan" : "Simpan Gateway"}
        </Button>
        {editing && (
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Batal
          </Button>
        )}
      </div>
    </form>
  );
}
