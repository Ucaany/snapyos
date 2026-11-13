import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { isWellFormedAuthToken } from "@/lib/auth-tokens";

export const metadata: Metadata = { title: "Reset Password | SnapyOS" };

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const valid = isWellFormedAuthToken(token);

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md border-2 border-ink bg-surface p-6 shadow-hard">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Keamanan akun
        </p>
        <h1 className="mt-2 text-2xl font-bold uppercase tracking-wide">Password baru</h1>
        {valid ? (
          <>
            <p className="mt-3 font-mono text-sm leading-relaxed">
              Tautan ini hanya berlaku sekali. Setelah tersimpan, semua sesi lama dicabut.
            </p>
            <div className="mt-6">
              <ResetPasswordForm token={token} />
            </div>
          </>
        ) : (
          <p className="mt-3 font-mono text-sm leading-relaxed">
            Tautan reset tidak valid. Minta tautan baru dari halaman lupa password.
          </p>
        )}
        <Link href="/login" className="mt-6 inline-block font-mono text-xs font-bold underline">
          Kembali ke halaman masuk
        </Link>
      </div>
    </main>
  );
}
