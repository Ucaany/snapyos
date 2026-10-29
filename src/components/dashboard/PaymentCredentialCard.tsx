"use client";

import { useState } from "react";
import { Copy, Pencil, PlugZap, Power, PowerOff, Trash2 } from "lucide-react";

import { PaymentCredentialForm } from "@/components/dashboard/PaymentCredentialForm";
import { IconButton } from "@/components/ui/icon-button";
import { canTestPaymentCredential, type PaymentCredentialPublic } from "@/lib/payment-credentials";
import {
  deleteCredentialAction,
  testCredentialAction,
  toggleCredentialAction,
} from "@/server/payment-credential-actions";

type Props = {
  credential: PaymentCredentialPublic;
  onChanged(): void;
};

const providerNames: Record<string, string> = {
  pakasir: "PAKASIR",
  midtrans: "MIDTRANS",
  tripay: "TRIPAY",
};

/**
 * PaymentCredentialCard — satu credential merchant owner: status, metode,
 * webhook URL (computed), aksi toggle / test sandbox / edit / hapus.
 * Secret never disalin; aksi fail-closed (error ditampilkan).
 */
export function PaymentCredentialCard({ credential, onChanged }: Props) {
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: true } | { error: string }>, success: string) {
    setPending(true);
    setNotice(null);
    setError(null);
    try {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
      } else {
        setNotice(success);
        onChanged();
      }
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
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

  const testSupported = canTestPaymentCredential(credential.provider);
  const testable = credential.environment === "sandbox" && testSupported;
  const testDisabledReason = !testSupported
    ? "Tes koneksi belum tersedia untuk provider ini."
    : credential.environment === "production"
      ? "Tes koneksi hanya tersedia untuk credential sandbox."
      : null;
  const testLabel = credential.environment === "production" ? "Tes Production" : "Tes Sandbox";

  if (editing) {
    return (
      <PaymentCredentialForm
        credential={credential}
        onCancel={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
      />
    );
  }

  return (
    <article className="grid gap-4 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_#111111]">
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

      {credential.provider === "pakasir" ? (
        <div className="grid gap-2 border-2 border-ink bg-muted p-3">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Verifikasi pembayaran server-to-server + header X-Secret. Dana QRIS masuk project
            merchant owner langsung (ditarik via dashboard Pakasir).
          </p>
          {credential.webhook_url ? (
            <>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em]">
                Webhook URL: daftarkan di Detail Proyek Pakasir
              </span>
              <code className="break-all font-mono text-xs">{credential.webhook_url}</code>
              <IconButton
                label="Salin webhook URL"
                icon={Copy}
                compact
                onClick={() => void copyWebhookUrl()}
              />
            </>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Webhook URL tersedia setelah SnapyOS_PUBLIC_BASE_URL dikonfigurasi.
            </p>
          )}
        </div>
      ) : credential.webhook_url ? (
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
          Webhook URL tersedia setelah SnapyOS_PUBLIC_BASE_URL dikonfigurasi.
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

      <div className="flex flex-wrap gap-2">
        <IconButton
          label={testLabel}
          hint={testDisabledReason ?? undefined}
          icon={PlugZap}
          variant="secondary"
          compact
          disabled={pending || !testable}
          onClick={() =>
            void run(
              () => testCredentialAction(credential.id),
              "Koneksi sandbox berhasil terverifikasi"
            )
          }
        />
        <IconButton
          label="Ubah credential"
          icon={Pencil}
          variant="outline"
          compact
          disabled={pending}
          onClick={() => setEditing(true)}
        />
        <IconButton
          label={credential.is_active ? "Nonaktifkan credential" : "Aktifkan credential"}
          icon={credential.is_active ? PowerOff : Power}
          variant="outline"
          compact
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
          compact
          disabled={pending}
          onClick={() => {
            if (
              window.confirm("Hapus credential merchant ini? Pembayaran metode hilang dari kiosk.")
            ) {
              void run(() => deleteCredentialAction(credential.id), "Credential dihapus");
            }
          }}
        />
      </div>

      {!testable && testDisabledReason && (
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {testDisabledReason}
        </p>
      )}
    </article>
  );
}
