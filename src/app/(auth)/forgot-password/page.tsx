import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Lupa Password | SnapyOS" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-6 py-12">
      <div className="w-full max-w-md border-2 border-ink bg-surface p-6 shadow-hard">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Keamanan akun
        </p>
        <h1 className="mt-2 text-2xl font-bold uppercase tracking-wide">Lupa password</h1>
        <p className="mt-3 font-mono text-sm leading-relaxed">
          Masukkan email akun. Jika terdaftar, kami mengirim tautan reset yang berlaku 1 jam dan
          hanya bisa dipakai sekali.
        </p>
        <div className="mt-6">
          <ForgotPasswordForm />
        </div>
        <Link href="/login" className="mt-6 inline-block font-mono text-xs font-bold underline">
          Kembali ke halaman masuk
        </Link>
      </div>
    </main>
  );
}
