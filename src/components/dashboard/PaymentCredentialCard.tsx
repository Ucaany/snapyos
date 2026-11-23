"use client";

import { useState } from "react";
import { Copy, Pencil, PlugZap, Power, PowerOff, Trash2 } from "lucide-react";

import { PaymentCredentialForm } from "@/components/dashboard/PaymentCredentialForm";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import {
  canTestCredentialInEnvironment,
  type PaymentCredentialPublic,
  type PaymentWebhookStatus,
} from "@/lib/payment-credentials";
import type { GatewayProvider } from "@/server/payment/providers/types";
import {
  deleteCredentialAction,
  testCredentialAction,
  toggleCredentialAction,
} from "@/server/payment-credential-actions";

type Props = {
  credential: PaymentCredentialPublic;
  webhookUrls?: Record<GatewayProvider, PaymentWebhookStatus>;
  onChanged(): void;
};

const providerNames: Record<string, string> = {
  midtrans: "MIDTRANS",
  tripay: "TRIPAY",
};

/**
 * PaymentCredentialCard — satu credential merchant owner: status, metode,
 * webhook URL (computed), aksi toggle / test sandbox / edit / hapus.
 * Secret never disalin; aksi fail-closed (error ditampilkan).
 */
export function PaymentCredentialCard({ credential, webhookUrls, onChanged }: Props) {
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    action: () => Promise<{ ok: true } | { error: string }>,
    success: string
  ): Promise<string | void> {
    setPending(true);
    setNotice(null);
    setError(null);
    try {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        return result.error;
      }
      setNotice(success);
      onChanged();
    } catch {
      const message = "Terjadi kesalahan. Coba lagi.";
      setError(message);
      return message;
    } finally {
      setPending(false);
    }
  }

  async function copyWebhookUrl() {
    setError(null);
    setNotice(null);
    if (!credential.webhook_url) return;
    try {
      await navigator.clipboard.writeText(credential.webhook_url);
      setNotice("Webhook URL disalin ke clipboard");
    } catch {
      setError("Browser memblokir penyalinan. Salin URL secara manual dengan memilih teks.");
    }
  }

  const testable = canTestCredentialInEnvironment(credential.provider, credential.environment);
  const testDisabledReason = testable
    ? null
    : "Tes Midtrans membuat transaksi uji, jadi hanya tersedia untuk credential sandbox.";
  const testSuccess =
    credential.provider === "midtrans"
      ? "Koneksi sandbox berhasil terverifikasi"
      : `Kredensial ${credential.environment} berhasil diverifikasi`;
  const testLabel = credential.environment === "production" ? "Tes Production" : "Tes Sandbox";

  if (editing) {
    return (
      <PaymentCredentialForm
        credential={credential}
        webhookUrls={webhookUrls}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );
  }

  return (
    <article className="grid gap-4 border-2 border-ink bg-surface p-5 shadow-hard">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink pb-3">
        <div>
          <h3 className="font-display text-xl uppercase tracking-tight">
            {credential.label || providerNames[credential.provider] || credential.provider}
          </h3>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em]">
            {credential.provider} / {credential.environment}
          </p>
        </div>
        <span
          className={
            credential.is_active
              ? "border-2 border-ink bg-accent px-2 py-1 font-mono text-[10px] font-bold uppercase"
              : "border-2 border-ink bg-muted px-2 py-1 font-mono text-[10px] font-bold uppercase"
          }
        >
          {credential.is_active ? "Aktif" : "Nonaktif"}
        </span>
      </div>

      <dl className="grid gap-2 font-mono text-xs">
        <div className="flex justify-between gap-4">
          <dt className="uppercase">Merchant</dt>
          <dd className="break-all text-right">{credential.merchant_id}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="uppercase">Metode</dt>
          <dd className="text-right">{credential.enabled_methods.join(", ") || "Belum dipilih"}</dd>
        </div>
      </dl>

      {credential.webhook_url ? (
        <div className="grid gap-2 border-2 border-ink bg-muted p-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em]">Webhook URL</span>
          <code className="break-all font-mono text-xs">{credential.webhook_url}</code>
          <IconButton
            label="Salin webhook URL"
            icon={Copy}
            compact
            onClick={() => void copyWebhookUrl()}
          />
        </div>
      ) : (
        <p className="border-2 border-ink bg-muted p-3 text-sm leading-relaxed text-muted-foreground">
          Webhook nonaktif: {credential.webhook_reason ?? "URL publik belum dikonfigurasi."}
        </p>
      )}

      {notice && (
        <p role="status" className="font-mono text-xs text-ink">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="font-mono text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3">
        <IconButton
          label={testLabel}
          hint={testDisabledReason ?? undefined}
          icon={PlugZap}
          variant="neutral"
          disabled={pending || !testable}
          onClick={() => void run(() => testCredentialAction(credential.id), testSuccess)}
        />
        <IconButton
          label="Ubah credential"
          icon={Pencil}
          variant="neutral"
          disabled={pending}
          onClick={() => setEditing(true)}
        />
        <IconButton
          label={credential.is_active ? "Nonaktifkan credential" : "Aktifkan credential"}
          icon={credential.is_active ? PowerOff : Power}
          variant="neutral"
          disabled={pending}
          onClick={() =>
            void run(
              () => toggleCredentialAction(credential.id, !credential.is_active),
              credential.is_active
                ? "Credential dinonaktifkan; metode otomatis hilang dari kiosk"
                : "Credential diaktifkan; metode tersedia di kiosk"
            )
          }
        />
        <IconButton
          label="Hapus credential"
          icon={Trash2}
          variant="destructive"
          disabled={pending}
          onClick={() => setConfirmOpen(true)}
        />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Hapus credential merchant?"
        description="Pembayaran dengan metode ini hilang dari kiosk. Transaksi lama tetap tersimpan."
        confirmLabel="Hapus"
        variant="destructive"
        onConfirm={() => run(() => deleteCredentialAction(credential.id), "Credential dihapus")}
      />

      {!testable && testDisabledReason && (
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {testDisabledReason}
        </p>
      )}
    </article>
  );
}
