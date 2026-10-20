"use client";

import { useState, type FormEvent } from "react";

import { PaymentMethodSelector } from "@/components/dashboard/PaymentMethodSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCredentialAction,
  updateCredentialAction,
  type UpdateInput,
} from "@/server/payment-credential-actions";
import type { PaymentCredentialPublic } from "@/lib/payment-credentials";
import type { GatewayProvider } from "@/server/payment/providers/types";

const providerLabels: Record<GatewayProvider, string> = {
  pakasir: "Pakasir",
  midtrans: "Midtrans",
  tripay: "Tripay",
};

type Props = {
  credential?: PaymentCredentialPublic;
  onCancel?(): void;
  onSaved(): void;
};

/**
 * PaymentCredentialForm — tambah/ubah credential merchant owner (direct merchant).
 * Dana transaksi masuk rekening owner via merchant key sendiri (aggregaat Pakasir
 * platform dihapus 2026-09-18). Secret terenkripsi app-layer; never ditampilkan.
 */
export function PaymentCredentialForm({ credential, onCancel, onSaved }: Props) {
  const editing = credential !== undefined;
  const [provider, setProvider] = useState<GatewayProvider>(credential?.provider ?? "pakasir");
  const [environment, setEnvironment] = useState<"sandbox" | "production">(
    credential?.environment ?? "sandbox"
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const serverKey = String(form.get("server_key") ?? "").trim();
    const privateKey = String(form.get("private_key") ?? "").trim();
    const clientKey = String(form.get("client_key") ?? "").trim();
    const webhookSecret = String(form.get("webhook_secret") ?? "").trim();
    const enabledMethods = form.getAll("enabled_methods").map(String);
    const common = {
      label: String(form.get("label") ?? "").trim() || null,
      merchant_id: String(form.get("merchant_id") ?? "").trim(),
      environment,
      is_active: form.get("is_active") === "on",
      enabled_methods: enabledMethods,
    };
    if (editing) {
      const input: UpdateInput = { ...common };
      if (serverKey) input.server_key = serverKey;
      if (privateKey) input.private_key = privateKey;
      if (clientKey) input.client_key = clientKey;
      if (webhookSecret) input.webhook_secret = webhookSecret;
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
        server_key: serverKey,
        client_key: clientKey || null,
        ...(privateKey ? { private_key: privateKey } : {}),
        ...(webhookSecret ? { webhook_secret: webhookSecret } : {}),
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

  const merchantLabel =
    provider === "tripay"
      ? "Merchant Code"
      : provider === "pakasir"
        ? "Project Slug"
        : "Merchant ID";
  const secretLabel =
    provider === "tripay" ? "API Key" : provider === "pakasir" ? "API Key" : "Server Key";

  const fieldError = (name: string) =>
    fieldErrors[name]?.[0] ? (
      <p role="alert" className="font-mono text-xs normal-case tracking-normal text-destructive">
        {fieldErrors[name][0]}
      </p>
    ) : null;

  return (
    <form
      onSubmit={(event) => void submit(event)}
      noValidate
      className="grid gap-4 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111]"
    >
      <div className="flex items-center justify-between gap-3 border-b-2 border-ink pb-3">
        <h2 className="font-display text-xl uppercase tracking-tight">
          {editing ? "Ubah Gateway" : "Tambah Gateway"}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em]">[ CREDENTIAL ]</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 font-mono text-xs uppercase tracking-[0.08em]">
          Provider
          <select
            value={provider}
            disabled={editing || pending}
            onChange={(event) => setProvider(event.target.value as GatewayProvider)}
            className="h-11 border-2 border-ink bg-surface px-3 text-sm normal-case shadow-[2px_2px_0_0_#111111] disabled:opacity-50"
          >
            {Object.entries(providerLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 font-mono text-xs uppercase tracking-[0.08em]">
          Environment
          <select
            value={environment}
            disabled={pending}
            onChange={(event) => setEnvironment(event.target.value as "sandbox" | "production")}
            className="h-11 border-2 border-ink bg-surface px-3 text-sm normal-case shadow-[2px_2px_0_0_#111111] disabled:opacity-50"
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
        <label className="grid gap-1 font-mono text-xs uppercase tracking-[0.08em]">
          {merchantLabel}
          <Input
            name="merchant_id"
            defaultValue={credential?.merchant_id ?? ""}
            required
            maxLength={160}
            disabled={pending}
          />
          {fieldError("merchant_id")}
        </label>
        <label className="grid gap-1 font-mono text-xs uppercase tracking-[0.08em]">
          {secretLabel}
          <Input
            name="server_key"
            required={!editing}
            type="password"
            autoComplete="new-password"
            maxLength={4000}
            placeholder={editing ? "Kosongkan untuk mempertahankan key" : undefined}
            disabled={pending}
          />
          {fieldError("server_key")}
        </label>
      </div>

      {provider === "midtrans" && (
        <label className="grid gap-1 font-mono text-xs uppercase tracking-[0.08em]">
          Client Key
          <Input
            name="client_key"
            defaultValue={credential?.client_key ?? ""}
            maxLength={500}
            disabled={pending}
          />
          {fieldError("client_key")}
        </label>
      )}
      {provider === "tripay" && (
        <label className="grid gap-1 font-mono text-xs uppercase tracking-[0.08em]">
          Private Key
          <Input
            name="private_key"
            required={!editing}
            type="password"
            autoComplete="new-password"
            maxLength={4000}
            placeholder={editing ? "Kosongkan untuk mempertahankan key" : undefined}
            disabled={pending}
          />
          {fieldError("private_key")}
        </label>
      )}
      {provider === "pakasir" && (
        <label className="grid gap-1 font-mono text-xs uppercase tracking-[0.08em]">
          Webhook Secret
          <Input
            name="webhook_secret"
            required={!editing}
            type="password"
            autoComplete="new-password"
            maxLength={4000}
            placeholder={editing ? "Kosongkan untuk mempertahankan secret" : undefined}
            disabled={pending}
          />
          {fieldError("webhook_secret")}
        </label>
      )}

      <PaymentMethodSelector
        provider={provider}
        selected={credential?.enabled_methods ?? []}
        disabled={pending}
      />

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
